import { readFileSync } from "node:fs";
import {
  EvalManifestSchema,
  EvalWireEventSchema,
  type StudioEvalTargets,
} from "@kortyx/agent/evals";
import { z } from "zod";

const targetSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(256),
    organizationId: z.uuid(),
    projectId: z.uuid(),
    environment: z.string().min(1),
    url: z.url(),
    serviceKey: z.string().min(32),
    allowInsecureHttp: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const url = new URL(value.url);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(value.allowInsecureHttp && url.protocol === "http:"))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Eval targets require HTTPS or explicit local HTTP opt-in, without URL credentials, query, or fragment.",
      });
  });
export type EvalTarget = z.infer<typeof targetSchema>;
type Diagnostic = NonNullable<
  StudioEvalTargets["targets"][number]["diagnostic"]
>;
export class EvalDiscoveryError extends Error {
  constructor(public readonly diagnostic: Diagnostic) {
    // Do not expose URLs, credentials, response bodies or validation details.
    super("Consumer eval endpoint is unavailable or incompatible.");
    this.name = "EvalDiscoveryError";
  }
}
export function loadEvalTargets(): EvalTarget[] {
  const source = process.env.KORTYX_EVAL_TARGETS_FILE;
  try {
    const targets = z
      .array(targetSchema)
      .parse(
        JSON.parse(
          source
            ? readFileSync(source, "utf8")
            : (process.env.KORTYX_EVAL_TARGETS ?? "[]"),
        ),
      );
    if (new Set(targets.map((target) => target.id)).size !== targets.length)
      throw new Error();
    return targets;
  } catch {
    throw new Error("Invalid server eval target configuration.");
  }
}
export async function fetchEvalManifest(
  target: EvalTarget,
  signal = AbortSignal.timeout(15_000),
) {
  let response: Response;
  try {
    response = await fetch(target.url, {
      headers: { authorization: `Bearer ${target.serviceKey}` },
      redirect: "error",
      signal,
    });
  } catch {
    throw new EvalDiscoveryError({ code: "endpoint_unreachable" });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new EvalDiscoveryError({
      code:
        response.status === 404
          ? "endpoint_not_found"
          : response.status === 401 || response.status === 403
            ? "endpoint_unauthorized"
            : "endpoint_http_error",
      httpStatus: response.status,
    });
  }
  if (!response.body)
    throw new EvalDiscoveryError({ code: "manifest_invalid" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000)
        throw new EvalDiscoveryError({ code: "manifest_invalid" });
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof EvalDiscoveryError) throw error;
    throw new EvalDiscoveryError({ code: "endpoint_unreachable" });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return EvalManifestSchema.parse(JSON.parse(text));
  } catch {
    throw new EvalDiscoveryError({ code: "manifest_invalid" });
  }
}
export async function* readEvalWire(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  let buffer = "";
  let total = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const part = await reader.read();
      signal?.throwIfAborted();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 32_000_000) throw new Error("Eval response is too large.");
      buffer += decoder.decode(part.value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) yield EvalWireEventSchema.parse(JSON.parse(line));
        newline = buffer.indexOf("\n");
      }
    }
    signal?.throwIfAborted();
    buffer += decoder.decode();
    if (buffer.trim()) yield EvalWireEventSchema.parse(JSON.parse(buffer));
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
