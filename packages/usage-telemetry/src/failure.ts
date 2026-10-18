import { type Outcome, publicCatalog, type UsageCatalog } from "./catalog";

/** Inspect data fields only; never serialize or evaluate application errors. */
export function usageErrorProperty(value: unknown, key: string): unknown {
  try {
    if (!value || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

const networkCodes: Readonly<Record<string, string>> = {
  ENOTFOUND: "NETWORK_DNS_FAILED",
  EAI_AGAIN: "NETWORK_DNS_FAILED",
  ECONNREFUSED: "NETWORK_CONNECTION_REFUSED",
  ECONNRESET: "NETWORK_CONNECTION_RESET",
  EPIPE: "NETWORK_CONNECTION_RESET",
  ETIMEDOUT: "NETWORK_TIMEOUT",
  UND_ERR_CONNECT_TIMEOUT: "NETWORK_TIMEOUT",
  UND_ERR_HEADERS_TIMEOUT: "NETWORK_TIMEOUT",
  UND_ERR_BODY_TIMEOUT: "NETWORK_TIMEOUT",
  CERT_HAS_EXPIRED: "NETWORK_TLS_FAILED",
  DEPTH_ZERO_SELF_SIGNED_CERT: "NETWORK_TLS_FAILED",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "NETWORK_TLS_FAILED",
};

export type UsageFailure = {
  outcome: Outcome;
  properties: Record<string, string | boolean>;
};

/** HTTP facts only: no URL, response body, headers or error text is inspected. */
export function classifyUsageHttpStatus(status: number): UsageFailure {
  if (!Number.isInteger(status) || status < 100 || status > 599)
    return {
      outcome: "failed",
      properties: {
        error_code: "UNCLASSIFIED_FAILURE",
        error_category: "unknown",
      },
    };
  if (status < 400)
    return {
      outcome: "success",
      properties: { http_status_class: `${Math.floor(status / 100)}xx` },
    };
  const code =
    status === 401
      ? "HTTP_UNAUTHORIZED"
      : status === 403
        ? "HTTP_FORBIDDEN"
        : status === 404
          ? "HTTP_NOT_FOUND"
          : status === 408 || status === 504
            ? "HTTP_TIMEOUT"
            : status === 409
              ? "HTTP_CONFLICT"
              : status === 413
                ? "HTTP_TOO_LARGE"
                : status === 429
                  ? "HTTP_RATE_LIMITED"
                  : status >= 500
                    ? "HTTP_SERVER_ERROR"
                    : "HTTP_INVALID_REQUEST";
  return {
    outcome: "failed",
    properties: {
      error_code: code,
      error_category: status >= 500 || status === 408 ? "transport" : "request",
      http_status: String(status),
      http_status_class: `${Math.floor(status / 100)}xx`,
      retryable: status === 408 || status === 429 || status >= 500,
    },
  };
}

function nativeExceptionName(value: unknown): unknown {
  // Call the platform's brand-checked getter, never a value's custom getter.
  try {
    if (typeof DOMException !== "undefined")
      return Object.getOwnPropertyDescriptor(
        DOMException.prototype,
        "name",
      )?.get?.call(value);
  } catch {
    /* Not a native DOMException. */
  }
  return undefined;
}

function classifyOne(
  error: unknown,
  catalog: UsageCatalog,
): UsageFailure | undefined {
  const read = (key: string) => usageErrorProperty(error, key);
  let name = read("name") ?? nativeExceptionName(error);
  try {
    if (name === undefined && error instanceof SyntaxError)
      name = "SyntaxError";
  } catch {
    /* A hostile proxy is not diagnostic evidence. */
  }
  const code = read("code");
  if (
    name === "AbortError" ||
    code === "EXECUTION_CANCELLED" ||
    code === "ABORT_ERR"
  )
    return { outcome: "cancelled", properties: {} };
  if (code === "EXECUTION_LIMIT_REACHED" || name === "ExecutionLimitReached")
    return { outcome: "limit_reached", properties: {} };
  if (
    typeof name === "string" &&
    [
      "GraphInterrupt",
      "NodeInterrupt",
      "Interrupt",
      "ParallelChildWaiting",
    ].includes(name)
  )
    return { outcome: "suspended", properties: {} };
  if (name === "EvalConfigurationError")
    return {
      outcome: "failed",
      properties: {
        error_code: "EVAL_SETTINGS_INVALID",
        error_category: "configuration",
        retryable: false,
      },
    };
  if (name === "TimeoutError")
    return {
      outcome: "failed",
      properties: {
        error_code: "NETWORK_TIMEOUT",
        error_category: "transport",
        retryable: true,
      },
    };
  if (typeof code === "string" && Object.hasOwn(networkCodes, code))
    return {
      outcome: "failed",
      properties: {
        error_code: networkCodes[code] ?? "UNCLASSIFIED_FAILURE",
        error_category: "transport",
        retryable: true,
      },
    };
  if (typeof code === "string" && catalog.errorCodes.includes(code)) {
    const failure = usageErrorProperty(error, "failure");
    const category =
      read("category") ?? usageErrorProperty(failure, "category");
    const retryable =
      read("retryable") ?? usageErrorProperty(failure, "retryable");
    const status = read("status") ?? usageErrorProperty(failure, "status");
    return {
      outcome: "failed",
      properties: {
        ...(typeof status === "number"
          ? classifyUsageHttpStatus(status).properties
          : {}),
        // The framework code is more specific than its HTTP projection.
        error_code: code,
        error_category:
          code !== "EXECUTION_FAILED" &&
          typeof category === "string" &&
          Array.isArray(catalog.properties.error_category) &&
          catalog.properties.error_category.includes(category)
            ? category
            : "unknown",
        ...(typeof retryable === "boolean" ? { retryable } : {}),
      },
    };
  }
  const status = read("status") ?? read("statusCode");
  if (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  )
    return classifyUsageHttpStatus(status);
  if (name === "ZodError" || name === "SyntaxError")
    return {
      outcome: "failed",
      properties: {
        error_code: "SCHEMA_VALIDATION",
        error_category: "validation",
      },
    };
  return undefined;
}

/** Bounded, cycle-safe projection of known codes, including wrapped network causes. */
export function classifyUsageError(
  error: unknown,
  catalog = publicCatalog,
): UsageFailure {
  const seen = new Set<unknown>();
  const pending = [{ value: error, depth: 0 }];
  let result: UsageFailure | undefined;
  while (pending.length && seen.size < 8) {
    const current = pending.shift();
    if (!current || seen.has(current.value)) continue;
    seen.add(current.value);
    const found = classifyOne(current.value, catalog);
    if (found) {
      if (!result) result = found;
      else if (
        found.properties.error_code &&
        found.outcome === "failed" &&
        found.properties.error_code !== result.properties.error_code
      ) {
        result.properties.cause_code = found.properties.error_code;
        result.properties.cause_category =
          found.properties.error_category ?? "unknown";
        if (
          result.properties.retryable === undefined &&
          typeof found.properties.retryable === "boolean"
        )
          result.properties.retryable = found.properties.retryable;
        break;
      }
      if (result === found && found.outcome !== "failed") return found;
    }
    if (current.depth < 3)
      for (const key of ["failure", "cause", "error"]) {
        const value = usageErrorProperty(current.value, key);
        if (value && typeof value === "object")
          pending.push({ value, depth: current.depth + 1 });
      }
  }
  return (
    result ?? {
      outcome: "failed",
      properties: { error_code: "other", error_category: "unknown" },
    }
  );
}
