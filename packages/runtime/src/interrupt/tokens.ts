import { randomUUID } from "node:crypto";

export function makeResumeToken(): string {
  return randomUUID();
}

export function makeRequestId(prefix = "req"): string {
  return `${prefix}-${randomUUID()}`;
}
