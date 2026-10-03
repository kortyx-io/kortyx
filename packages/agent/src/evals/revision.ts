import { createHash } from "node:crypto";
import type { EvalSuite } from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const getEvalSuiteRevision = (suite: EvalSuite): string =>
  createHash("sha256").update(canonical(suite)).digest("hex");
