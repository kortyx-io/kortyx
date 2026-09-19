import type { StudioDetailEvent } from "@kortyx/telemetry-contracts";
import { StudioReadError } from "./read-client";

export type StudioEntity = "runs" | "sessions" | "interrupts";
export type StudioTarget = {
  entity: StudioEntity;
  id: string;
  url?: string;
  selection?: Record<string, string>;
};
export const parseStudioTarget = (
  input: string,
  entity?: StudioEntity,
): StudioTarget => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new StudioReadError("invalid_target", "Invalid Studio URL.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new StudioReadError(
        "invalid_target",
        "Use an HTTP(S) Studio entity URL without embedded credentials.",
      );
    }
    const match = url.pathname.match(
      /\/(runs|sessions|interrupts)\/([^/]+)\/?$/,
    );
    if (!match)
      throw new StudioReadError(
        "invalid_target",
        "Expected a Studio /runs/<id>, /sessions/<id>, or /interrupts/<id> URL.",
      );
    if (entity && match[1] !== entity)
      throw new StudioReadError(
        "invalid_target",
        "URL entity type does not match the command.",
      );
    let id: string;
    try {
      id = decodeURIComponent(match[2] ?? "");
    } catch {
      throw new StudioReadError(
        "invalid_target",
        "Invalid entity ID encoding.",
      );
    }
    validateId(id);
    // Preserve navigation context, but never turn URL query parameters into API filters.
    const selection: Record<string, string> = {};
    for (const key of [
      "tab",
      "sessionTab",
      "call",
      "branch",
      "node",
      "event",
      "trace",
      "detailView",
    ]) {
      const value = url.searchParams.get(key);
      if (value) selection[key] = value;
    }
    // Query strings may contain credentials or arbitrary content. Only retain known UI selectors.
    url.search = "";
    url.hash = "";
    return {
      entity: match[1] as StudioEntity,
      id,
      url: url.toString(),
      selection,
    };
  }
  if (!entity)
    throw new StudioReadError(
      "invalid_target",
      "inspect requires a Studio entity URL. Use runs/sessions/interrupts get for a bare ID.",
    );
  validateId(input);
  return { entity, id: input };
};
const validateId = (id: string) => {
  if (
    !id ||
    id.length > 512 ||
    id === "." ||
    id === ".." ||
    /[\s/?#\\]/.test(id) ||
    [...id].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  ) {
    throw new StudioReadError("invalid_target", "Invalid Studio entity ID.");
  }
};

const secretKey =
  /(?:password|secret|authorization|cookie|apikey|credential|resumetoken|accesstoken|refreshtoken|bearertoken|sessiontoken|authtoken)/i;
const contentKey =
  /^(?:input|output|inputs|outputs|inputmessages|outputmessages|messages|prompt|systemprompt|question|response|result|latestresult|arguments|args|content|text|options)$/i;
export const sanitizeStudioData = (
  value: unknown,
  includeContent: boolean,
  key = "",
): unknown => {
  const normalized = key.replace(/[^a-z0-9]/gi, "");
  const keyPolicy =
    normalized.toLowerCase() === "apikey" &&
    value &&
    typeof value === "object" &&
    "scopes" in value &&
    "mode" in value;
  if (secretKey.test(normalized) && !keyPolicy) return "[REDACTED]";
  if (!includeContent && contentKey.test(normalized))
    return "[CONTENT OMITTED: use --include-content]";
  if (typeof value === "string")
    return value
      .replace(/ktyx_(?:test|live)_[^\s"'<>]+/g, "[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");
  if (Array.isArray(value))
    return value.map((item) => sanitizeStudioData(item, includeContent));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        sanitizeStudioData(item, includeContent, name),
      ]),
    );
  return value;
};

export const summarizeEvidence = (events: StudioDetailEvent[]) => {
  const findings = events.flatMap((event) => {
    const payload = event.payload;
    const failed =
      /(?:failed|error|fault)/i.test(event.type) ||
      payload.outcome === "fault" ||
      payload.status === "failed";
    const warning =
      /(?:retry|cancel|interrupt|limit_reached|denied|suspended|waiting)/i.test(
        event.type,
      ) || ["denied", "cancelled"].includes(String(payload.outcome));
    if (!failed && !warning) return [];
    return [
      {
        eventId: event.id,
        runId: event.runId,
        nodeId: event.nodeId,
        type: event.type,
        occurredAt: event.occurredAt,
        severity: failed ? "error" : "context",
        evidence: payload,
      },
    ];
  });
  return {
    findings,
    note: "Evidence, not an automated root-cause verdict. Interrupts, cancellations, and retries can be expected; correlate with the final run outcome. Missing telemetry does not prove an action did not occur.",
  };
};

export const formatReadOutput = (value: unknown, json: boolean) => {
  if (json) return JSON.stringify(value);
  // Human mode is deliberately unambiguous and pipeable, without terminal UI/spinners.
  return JSON.stringify(value, null, 2);
};
