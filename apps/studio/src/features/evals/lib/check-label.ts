import type { EvalCheck } from "@kortyx/agent/evals";

export function evalCheckLabel(check: EvalCheck): string {
  switch (check.type) {
    case "text-equals":
      return `Answer equals ${JSON.stringify(check.value)}${check.ignoreCase ? " (ignoring case)" : ""}`;
    case "text-contains":
      return `Answer contains ${JSON.stringify(check.value)}`;
    case "text-matches":
      return check.pattern === "\\S" && !check.flags
        ? "Answer contains text"
        : `Answer matches /${check.pattern}/${check.flags ?? ""}`;
    case "tool-called":
      return `Observed tool call: ${check.tool}`;
    case "tool-input-equals":
      return `Observed tool input equals the expected value: ${check.tool}`;
    case "output-equals":
      return `${check.schemaId}${check.schemaVersion ? ` v${check.schemaVersion}` : ""}: data${check.path.map((part) => `[${JSON.stringify(part)}]`).join("")} equals ${JSON.stringify(check.value)}`;
  }
}
