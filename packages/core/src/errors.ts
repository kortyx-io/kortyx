/** Browser-safe failure contracts. Never import runtime or provider code here. */
export type FailureCategory =
  | "configuration"
  | "provider"
  | "validation"
  | "domain"
  | "workflow"
  | "persistence"
  | "request"
  | "transport"
  | "internal";
export type FailureIssue = { code: string; path: Array<string | number> };
export type FailureDescriptor = {
  version: 1;
  code: string;
  category: FailureCategory;
  message: string;
  retryable: boolean | null;
  source?: string;
  operation?: string;
  status?: number;
  retryAfterMs?: number;
  domainCode?: string;
  details?: Record<string, unknown>;
  issues?: FailureIssue[];
  usage?: {
    input?: number;
    output?: number;
    total?: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  finishReason?: { unified: string };
  context?: Record<string, string>;
  cause?: FailureDescriptor;
  results?: Array<{
    status: "fulfilled" | "rejected";
    failure?: FailureDescriptor;
  }>;
  truncated?: boolean;
};

export const FAILURE_LIMITS = {
  depth: 4,
  message: 1024,
  string: 256,
  issues: 20,
  results: 64,
  keys: 32,
  bytes: 32768,
} as const;
const categories = new Set<unknown>([
  "configuration",
  "provider",
  "validation",
  "domain",
  "workflow",
  "persistence",
  "request",
  "transport",
  "internal",
]);

/** Read data properties only: diagnostics must not invoke application getters. */
export function errorProperty(value: unknown, key: string): unknown {
  try {
    if (!value || (typeof value !== "object" && typeof value !== "function"))
      return undefined;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property && "value" in property ? property.value : undefined;
  } catch {
    return undefined;
  }
}
const text = (
  value: unknown,
  max: number = FAILURE_LIMITS.string,
): string | undefined =>
  typeof value === "string" ? value.slice(0, max) : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
const unknownFailure = (): FailureDescriptor => ({
  version: 1,
  code: "EXECUTION_FAILED",
  category: "internal",
  message: "An unexpected error occurred.",
  retryable: null,
});

/** Codes are structural; error class identity is not required across package copies. */
export function isFailureDescriptor(
  value: unknown,
): value is FailureDescriptor {
  return (
    errorProperty(value, "version") === 1 &&
    typeof errorProperty(value, "code") === "string" &&
    categories.has(errorProperty(value, "category")) &&
    typeof errorProperty(value, "message") === "string" &&
    [true, false, null].includes(
      errorProperty(value, "retryable") as boolean | null,
    )
  );
}

/** Engine signals are recognized before normalization; domain codes live elsewhere. */
export function isControlFlowError(error: unknown): boolean {
  try {
    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError"
    )
      return true;
  } catch {}
  const code = errorProperty(error, "code");
  const name = errorProperty(error, "name");
  return (
    code === "EXECUTION_CANCELLED" ||
    code === "EXECUTION_LIMIT_REACHED" ||
    name === "AbortError" ||
    isSuspensionControlFlowError(error)
  );
}

/** Expected suspension signals pause execution without representing a failure. */
export function isSuspensionControlFlowError(error: unknown): boolean {
  const name = errorProperty(error, "name");
  return (
    name === "GraphInterrupt" ||
    name === "NodeInterrupt" ||
    name === "ParallelChildWaiting"
  );
}

function safeDetails(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return text(value);
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (depth >= 2 || !value || typeof value !== "object") return undefined;
  try {
    if (Array.isArray(value))
      return Array.from(
        { length: Math.min(value.length, 20) },
        (_, i) =>
          safeDetails(errorProperty(value, String(i)), depth + 1) ?? null,
      );
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value).slice(0, FAILURE_LIMITS.keys)) {
      if (["__proto__", "prototype", "constructor", "toJSON"].includes(key))
        continue;
      const child = safeDetails(errorProperty(value, key), depth + 1);
      if (child !== undefined) result[key.slice(0, 64)] = child;
    }
    return result;
  } catch {
    return undefined;
  }
}

function copyFailure(
  value: unknown,
  depth: number,
  budget = { remaining: 128, seen: new WeakSet<object>() },
): FailureDescriptor {
  if (!isFailureDescriptor(value)) return unknownFailure();
  const read = (key: string) => errorProperty(value, key);
  const result: FailureDescriptor = {
    version: 1,
    code: text(read("code")) ?? "EXECUTION_FAILED",
    category: read("category") as FailureCategory,
    message:
      text(read("message"), FAILURE_LIMITS.message) ??
      "An unexpected error occurred.",
    retryable: read("retryable") as boolean | null,
  };
  if (budget.remaining-- <= 0 || budget.seen.has(value))
    return { ...result, truncated: true };
  budget.seen.add(value);
  for (const key of ["source", "operation", "domainCode"] as const) {
    const field = text(read(key));
    if (field) result[key] = field;
  }
  for (const key of ["status", "retryAfterMs"] as const) {
    const field = number(read(key));
    if (field !== undefined) result[key] = field;
  }
  const details = safeDetails(read("details"));
  if (details && !Array.isArray(details) && typeof details === "object")
    result.details = details as Record<string, unknown>;
  const context = safeDetails(read("context"));
  if (context && typeof context === "object" && !Array.isArray(context))
    result.context = Object.fromEntries(
      Object.entries(context).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  const usage = read("usage");
  if (usage) {
    result.usage = {};
    for (const key of [
      "input",
      "output",
      "total",
      "reasoning",
      "cacheRead",
      "cacheWrite",
    ] as const) {
      const amount = number(errorProperty(usage, key));
      if (amount !== undefined) result.usage[key] = amount;
    }
  }
  const unified = text(errorProperty(read("finishReason"), "unified"));
  if (unified) result.finishReason = { unified };
  const issues = read("issues");
  if (Array.isArray(issues)) {
    result.issues = issues.slice(0, FAILURE_LIMITS.issues).map((issue) => {
      const path = errorProperty(issue, "path");
      return {
        code: text(errorProperty(issue, "code")) ?? "invalid_value",
        path: Array.isArray(path)
          ? path
              .slice(0, 16)
              .map((part) =>
                typeof part === "number" && Number.isFinite(part)
                  ? part
                  : "[field]",
              )
          : [],
      };
    });
    if (issues.length > FAILURE_LIMITS.issues) result.truncated = true;
  }
  if (depth < FAILURE_LIMITS.depth) {
    if (read("cause"))
      result.cause = copyFailure(read("cause"), depth + 1, budget);
    const results = read("results");
    if (Array.isArray(results)) {
      result.results = results.slice(0, FAILURE_LIMITS.results).map((entry) =>
        errorProperty(entry, "status") === "fulfilled"
          ? { status: "fulfilled" }
          : {
              status: "rejected",
              failure: copyFailure(
                errorProperty(entry, "failure"),
                depth + 1,
                budget,
              ),
            },
      );
      if (results.length > FAILURE_LIMITS.results) result.truncated = true;
    }
  } else if (read("cause") || read("results")) result.truncated = true;
  if (
    read("truncated") ||
    (read("message") as string).length > FAILURE_LIMITS.message
  )
    result.truncated = true;
  return result;
}

/** Sanitize wire/checkpoint descriptors. Unknown objects never supply public prose. */
export function serializeFailure(error: unknown): FailureDescriptor {
  if (isControlFlowError(error)) throw error;
  const candidate = isFailureDescriptor(error)
    ? error
    : errorProperty(error, "failure");
  try {
    const result = copyFailure(candidate, 0);
    // Metadata may be attached after a provider returns its final usage.
    if (candidate && candidate !== error) {
      for (const key of ["usage", "finishReason"] as const) {
        const value = errorProperty(error, key);
        if (value)
          Object.assign(result, copyFailure({ ...result, [key]: value }, 0));
      }
    }
    if (
      new TextEncoder().encode(JSON.stringify(result)).length <=
      FAILURE_LIMITS.bytes
    )
      return result;
    // Preserve aggregate membership/order while bounding each diagnostic.
    const compact = (item: FailureDescriptor): FailureDescriptor => ({
      version: 1,
      code: item.code.slice(0, 64),
      category: item.category,
      message: "Failure details were truncated.",
      retryable: item.retryable,
      truncated: true,
    });
    return {
      ...compact(result),
      ...(result.results
        ? {
            results: result.results.map((entry) =>
              entry.status === "fulfilled"
                ? entry
                : {
                    status: "rejected" as const,
                    failure: compact(entry.failure as FailureDescriptor),
                  },
            ),
          }
        : {}),
    };
  } catch {
    return unknownFailure();
  }
}

export type FailureOptions = Partial<
  Omit<FailureDescriptor, "version" | "code" | "message" | "cause">
> & { cause?: unknown; safeMessage?: string | undefined };

export class KortyxError extends Error {
  readonly failure: FailureDescriptor;
  readonly code: string;
  constructor(
    code: string,
    message: string,
    options: Omit<FailureOptions, "cause"> & { cause?: unknown } = {},
  ) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "KortyxError";
    this.code = code;
    this.failure = serializeFailure({
      ...options,
      version: 1,
      code,
      category: options.category ?? "internal",
      message: options.safeMessage ?? "An unexpected error occurred.",
      retryable: options.retryable ?? null,
      ...(options.cause !== undefined
        ? { cause: serializeFailure(options.cause) }
        : {}),
    });
  }
  get category(): FailureCategory {
    return this.failure.category;
  }
  get retryable(): boolean | null {
    return this.failure.retryable;
  }
  get status(): number | undefined {
    return this.failure.status;
  }
  get statusCode(): number | undefined {
    return this.failure.status;
  }
  get retryAfterMs(): number | undefined {
    return this.failure.retryAfterMs;
  }
  toJSON(): FailureDescriptor {
    return serializeFailure(this);
  }
}

/** Explicit opt-in: the application declares this message/details safe to persist. */
export class DomainError extends KortyxError {
  constructor(
    domainCode: string,
    safeMessage: string,
    options: {
      details?: Record<string, unknown>;
      cause?: unknown;
      retryable?: boolean;
    } = {},
  ) {
    super("DOMAIN_ERROR", safeMessage, {
      ...options,
      category: "domain",
      domainCode,
      safeMessage,
    });
    this.name = "DomainError";
  }
}

export class ValidationError extends KortyxError {
  declare readonly issues: unknown;
  constructor(code: string, message: string, cause?: unknown) {
    const issues = errorProperty(cause, "issues");
    super(code, message, {
      category: "validation",
      retryable: false,
      safeMessage:
        code === "OUTPUT_TRUNCATED"
          ? "Model output reached its length limit. Increase maxOutputTokens or simplify the output."
          : code === "INVALID_MODEL_JSON"
            ? "The model did not return valid JSON."
            : "The output did not satisfy the expected schema.",
      cause,
      ...(Array.isArray(issues) ? { issues } : {}),
    });
    this.name = "ValidationError";
    Object.defineProperty(this, "issues", { value: issues, enumerable: false });
  }
}

export function errorFromFailure(
  failure: unknown,
  legacyMessage?: string,
): KortyxError {
  const descriptor = serializeFailure(failure);
  const error = new KortyxError(
    descriptor.code,
    legacyMessage ?? descriptor.message,
    { ...descriptor, safeMessage: descriptor.message },
  );
  Object.assign(error.failure, descriptor);
  return error;
}

export class PersistenceError extends KortyxError {
  constructor(message: string, cause?: unknown) {
    super("PERSISTENCE_ERROR", message, {
      category: "persistence",
      retryable: null,
      safeMessage:
        "Runtime persistence failed. Check the store connection and server logs before resuming.",
      cause,
    });
    this.name = "PersistenceError";
  }
}

export class WorkflowContractError extends KortyxError {
  constructor(message: string, cause?: unknown) {
    super("WORKFLOW_CONTRACT_ERROR", message, {
      category: "workflow",
      retryable: false,
      safeMessage:
        "The workflow call contract is invalid. Check registration, schemas, call IDs and replay order.",
      cause,
    });
    this.name = "WorkflowContractError";
  }
}

export function failureHttpStatus(error: unknown): number {
  const failure = serializeFailure(error);
  if (failure.category === "request")
    return failure.code === "NOT_FOUND" || failure.code === "UNKNOWN_WORKFLOW"
      ? 404
      : 400;
  if (failure.category === "provider") return 502;
  if (failure.category === "persistence") return 503;
  return 500;
}

export class ProviderConfigurationError extends KortyxError {
  constructor(message = "", options: ErrorOptions = {}) {
    super("PROVIDER_CONFIGURATION", message, {
      category: "configuration",
      retryable: false,
      safeMessage:
        "Provider configuration is invalid. Check the server provider settings and credentials.",
      cause: options.cause,
    });
    this.name = "ProviderConfigurationError";
  }
}

export class ProviderRequestError extends KortyxError {
  constructor(message = "", options: FailureOptions & { code?: string } = {}) {
    super(options.code ?? "PROVIDER_INVALID_RESPONSE", message, {
      category: "provider",
      retryable: false,
      safeMessage: "The provider returned an invalid response.",
      ...options,
    });
    this.name = "ProviderRequestError";
  }
}

const providerName = (id: string): string =>
  ({
    openai: "OpenAI",
    google: "Google",
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    groq: "Groq",
    mistral: "Mistral",
    openrouter: "OpenRouter",
  })[id] ?? id;

export function providerHttpError(
  provider: string,
  response: Response,
  action: string,
  message: string,
): ProviderRequestError {
  const raw = response.headers.get("retry-after");
  const seconds =
    raw && /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) * 1000 : undefined;
  const date =
    raw && seconds === undefined ? Date.parse(raw) - Date.now() : undefined;
  const retryAfterMs = seconds ?? date;
  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;
  const error = new ProviderRequestError(
    `${providerName(provider)} provider failed to ${action}: ${message}`,
    {
      code: "PROVIDER_HTTP_ERROR",
      source: provider,
      cause: response,
      operation: action,
      status: response.status,
      retryable,
      safeMessage: `Provider request failed (HTTP ${response.status}).`,
      ...(retryAfterMs !== undefined && Number.isFinite(retryAfterMs)
        ? { retryAfterMs: Math.max(0, retryAfterMs) }
        : {}),
    },
  );
  return error;
}

export function normalizeProviderError(
  provider: string,
  action: string,
  error: unknown,
): Error {
  if (isControlFlowError(error)) return error as Error;
  if (isFailureDescriptor(errorProperty(error, "failure")))
    return error as Error;
  const message =
    text(errorProperty(error, "message"), FAILURE_LIMITS.message) ??
    "Request failed";
  const network =
    error instanceof TypeError ||
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(
      errorProperty(error, "code") as string,
    );
  const result = new ProviderRequestError(
    `${providerName(provider)} provider failed to ${action}: ${message}`,
    {
      code:
        error instanceof SyntaxError
          ? "PROVIDER_INVALID_RESPONSE"
          : network
            ? "PROVIDER_TRANSPORT_ERROR"
            : "PROVIDER_REQUEST_FAILED",
      source: provider,
      operation: action,
      retryable: null,
      safeMessage: "The provider request could not be completed.",
      cause: error,
    },
  );
  return result;
}

/** Shared HTTP boundary for built-in providers; body prose stays on the live error. */
export async function assertProviderResponse(
  provider: string,
  response: Response,
  action: string,
): Promise<void> {
  if (response.ok) return;
  let message = `HTTP ${response.status}`;
  let providerCode: unknown;
  try {
    const payload: unknown = await response.json();
    const detail = errorProperty(payload, "error");
    const candidate =
      errorProperty(payload, "message") ??
      errorProperty(payload, "detail") ??
      errorProperty(detail, "message");
    if (typeof candidate === "string" && candidate.trim())
      message = candidate.slice(0, FAILURE_LIMITS.message);
    providerCode =
      errorProperty(detail, "code") ?? errorProperty(detail, "type");
  } catch (error) {
    if (isControlFlowError(error)) throw error;
    /* Status remains authoritative when the body is unreadable. */
  }
  const failure = providerHttpError(provider, response, action, message);
  if (
    [
      "insufficient_quota",
      "billing_hard_limit_reached",
      "invalid_api_key",
      "authentication_error",
      "permission_error",
    ].includes(providerCode as string)
  ) {
    failure.failure.retryable = false;
    failure.failure.details = { providerCode };
  }
  throw failure;
}
