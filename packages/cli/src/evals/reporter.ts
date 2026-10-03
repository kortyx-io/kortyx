import type { EvalProgress, EvalRunResult, EvalSuite } from "@kortyx/agent";

// Strip control characters from app/model strings before writing to a terminal.
const text = (value: string) => value.replace(/\p{Cc}/gu, " ").trim();
const duration = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

export function createEvalTerminalReporter(
  write: (value: string) => void,
  color: boolean,
) {
  const paint = (code: number, value: string) =>
    color ? `\u001b[${code}m${value}\u001b[0m` : value;
  let active = 0;
  let completed = 0;
  let live = false;
  const clear = () => {
    if (live) write("\r\u001b[2K");
    live = false;
  };
  const line = (value = "") => {
    clear();
    write(`${value}\n`);
  };
  let names = new Map<string, string>();
  return {
    start(suite: EvalSuite) {
      names = new Map(
        suite.cases.map((item) => [item.id, item.name ?? item.id]),
      );
      active = completed = 0;
      line();
      line(paint(36, `◆ Kortyx Evals · ${text(suite.name ?? suite.id)}`));
      line(paint(90, `  ${text(suite.id)} · local execution`));
      line();
    },
    progress(event: EvalProgress) {
      if (event.type === "case-started") active++;
      if (event.type === "case-completed") {
        active--;
        completed++;
        const item = event.result;
        const passed = item.status === "passed";
        const symbol = passed ? "✓" : item.status === "cancelled" ? "−" : "✗";
        line(
          `  ${paint(passed ? 32 : item.status === "cancelled" ? 33 : 31, symbol)} ${text(names.get(item.caseId) ?? item.caseId)} ${paint(90, `[${text(item.caseId)}] #${item.repetition} · ${duration(item.durationMs)}`)} ${paint(passed ? 32 : 31, item.status.toUpperCase())}`,
        );
      }
      if (color) {
        clear();
        write(paint(36, `  RUN ${completed} completed · ${active} active`));
        live = true;
      }
    },
    finish(result: EvalRunResult) {
      for (const item of result.cases) {
        for (const step of item.steps) {
          if (step.status === "passed") continue;
          line();
          line(
            paint(
              31,
              `  ${text(names.get(item.caseId) ?? item.caseId)} › attempt ${item.repetition} › step ${step.index + 1}`,
            ),
          );
          line(
            `    Expected ${step.expectation.type} · observed ${step.observation.type}`,
          );
          if (step.reason) line(`    ${text(step.reason)}`);
          for (const criterion of step.criteria.filter(
            (value) => !value.passed,
          )) {
            line(`    ✗ ${text(criterion.text)}`);
            line(`      ${text(criterion.reason)}`);
            for (const evidence of criterion.evidence)
              line(paint(90, `      Evidence: ${text(evidence)}`));
          }
        }
        for (const issue of item.errors)
          line(
            `    ${text(item.caseId)} · ${issue.phase} [${issue.code}] ${text(issue.message)}`,
          );
      }
      for (const issue of result.errors)
        line(`    ${issue.phase} [${issue.code}] ${text(issue.message)}`);
      line();
      line(
        `  ${paint(32, `${result.counts.passed} passed`)} · ${paint(31, `${result.counts.failed} failed`)} · ${result.counts.error} errors · ${result.counts.cancelled} cancelled`,
      );
      line(
        paint(
          90,
          `  Duration ${duration(result.durationMs)} · ${result.cases.length} attempts`,
        ),
      );
      line();
    },
    close: clear,
  };
}
