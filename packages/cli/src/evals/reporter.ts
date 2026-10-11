import type {
  EvalPhase,
  EvalProgress,
  EvalRunResult,
  EvalSuite,
} from "@kortyx/agent";

// App/model strings must not move the cursor or override terminal direction.
const text = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
const duration = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
const wide =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u;
const fit = (value: string, columns: number) => {
  const clean = value.replace(/[\p{Cc}\p{Cf}]/gu, " ").trimEnd();
  let used = 0;
  let result = "";
  for (const char of clean) {
    used += /\p{Mark}/u.test(char) ? 0 : wide.test(char) ? 2 : 1;
    if (used > columns - 2) return `${result}…`;
    result += char;
  }
  return result;
};
const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const phaseNames: Record<EvalPhase, string> = {
  params: "Preparing inputs",
  setup: "Setting up test",
  execute: "Running workflow",
  responder: "Resolving human input",
  reference: "Loading reference",
  grading: "Checking expectations",
  cleanup: "Cleaning up",
  reporting: "Reporting results",
};
type ActiveCase = {
  caseId: string;
  repetition: number;
  started: number;
  phase: EvalPhase;
  stepIndex?: number | undefined;
  completedSteps: number;
};

export function createEvalTerminalReporter(
  write: (value: string) => void,
  color: boolean,
  options: { columns?: () => number; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  const columns = () =>
    Math.max(12, options.columns?.() ?? process.stdout.columns ?? 100);
  const paint = (code: string | number, value: string) =>
    color ? `\u001b[${code}m${value}\u001b[0m` : value;
  const active = new Map<string, ActiveCase>();
  let names = new Map<string, string>();
  let steps = new Map<string, number>();
  let completed = 0;
  let total = 0;
  let started = 0;
  let frame = 0;
  let liveLines = 0;
  let paused = false;
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const key = (id: string, repetition: number) =>
    JSON.stringify([id, repetition]);
  const clear = () => {
    if (liveLines) write(`\u001b[${liveLines}A\r\u001b[0J`);
    liveLines = 0;
  };
  const line = (value = "") => {
    clear();
    write(`${value}\n`);
  };
  const progressBar = (
    done: number,
    count: number,
    width: number,
    pulse = false,
  ) => {
    const filled = count
      ? Math.min(width, Math.floor((done / count) * width))
      : 0;
    const remaining = width - filled;
    const pending =
      pulse && remaining > 0
        ? Array.from({ length: remaining }, (_, index) =>
            index === frame % remaining ? "╸" : "░",
          ).join("")
        : "░".repeat(remaining);
    return `${"━".repeat(filled)}${pending}`;
  };
  const render = () => {
    if (!color || !running || paused) return;
    clear();
    const width = columns();
    const barWidth = Math.max(6, Math.min(22, width - 60));
    const percent = total ? Math.floor((completed / total) * 100) : 0;
    const lines = [
      paint(
        36,
        fit(
          `  RUN ${progressBar(completed, total, barWidth)} ${completed}/${total || "?"} · ${percent}%`,
          width,
        ),
      ),
      paint(
        90,
        fit(
          `  ${active.size} running · ${Math.max(0, total - completed - active.size)} queued · ${((now() - started) / 1000).toFixed(1)}s elapsed`,
          width,
        ),
      ),
    ];
    for (const item of [...active.values()].slice(0, 6)) {
      const name = names.get(item.caseId) ?? item.caseId;
      lines.push(
        paint(
          33,
          fit(
            `  ${frames[frame % frames.length]} ${name} #${item.repetition}`,
            width,
          ),
        ),
      );
      const stepCount = steps.get(item.caseId) ?? 1;
      const step =
        item.stepIndex === undefined
          ? ""
          : `Step ${item.stepIndex + 1}/${stepCount} · `;
      lines.push(
        paint(
          item.phase === "grading" ? 35 : 90,
          fit(
            `    ${progressBar(item.completedSteps, stepCount, 6, true)} ${step}${phaseNames[item.phase]} · ${((now() - item.started) / 1000).toFixed(1)}s`,
            width,
          ),
        ),
      );
    }
    if (active.size > 6)
      lines.push(paint(90, `  +${active.size - 6} more running`));
    write(`${lines.join("\n")}\n`);
    liveLines = lines.length;
    frame++;
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    running = false;
    clear();
  };
  return {
    start(suite: EvalSuite) {
      stop();
      names = new Map(
        suite.cases.map((item) => [item.id, item.name ?? item.id]),
      );
      steps = new Map(suite.cases.map((item) => [item.id, item.steps.length]));
      active.clear();
      completed = total = frame = 0;
      paused = false;
      started = now();
      line();
      if (color)
        line(paint(35, "  ━".padEnd(Math.min(columns() - 1, 64), "━")));
      line(paint("1;35", `◆ Kortyx Evals · ${text(suite.name ?? suite.id)}`));
      line(paint(90, `  ${text(suite.id)} · local execution`));
      line();
      running = true;
      if (color) {
        timer = setInterval(render, 100);
        timer.unref();
      }
    },
    progress(event: EvalProgress) {
      // Billing associations do not change terminal attempt progress.
      if (event.type === "case-runtime-associated") return;
      if (event.type === "run-started") {
        total = event.caseIds.length * event.repetitions;
        line(
          paint(
            90,
            `  ${event.caseIds.length} ${event.caseIds.length === 1 ? "test" : "tests"} · ${total} ${total === 1 ? "attempt" : "attempts"} · concurrency ${event.concurrency}`,
          ),
        );
        line();
      } else if (event.type === "case-started") {
        active.set(key(event.caseId, event.repetition), {
          caseId: event.caseId,
          repetition: event.repetition,
          started: now(),
          phase: "params",
          completedSteps: 0,
        });
        if (!color)
          line(
            `  → ${text(names.get(event.caseId) ?? event.caseId)} [${text(event.caseId)}] #${event.repetition} RUNNING`,
          );
      } else if (event.type === "case-progress") {
        const item = active.get(key(event.caseId, event.repetition));
        if (item) {
          item.phase = event.phase;
          item.stepIndex = event.stepIndex;
        }
      } else if (event.type === "step-completed") {
        const item = active.get(key(event.caseId, event.repetition));
        if (item) item.completedSteps = event.step.index + 1;
        const passed = event.step.status === "passed";
        const criterionCount = event.step.criteria.length;
        const detail = criterionCount
          ? ` · ${event.step.criteria.filter((criterion) => criterion.passed).length}/${criterionCount} criteria passed`
          : "";
        line(
          `    ${paint(passed ? 32 : 33, passed ? "✓" : "◇")} ${text(event.caseId)} #${event.repetition} · Step ${event.step.index + 1}/${steps.get(event.caseId) ?? "?"} · ${event.step.observation.type === "interrupt" ? "Human input requested" : text(event.step.observation.type)}${detail}`,
        );
      } else {
        const item = event.result;
        active.delete(key(item.caseId, item.repetition));
        completed++;
        const passed = item.status === "passed";
        const cancelled = item.status === "cancelled";
        const code = passed
          ? 32
          : cancelled || item.status === "ungraded"
            ? 33
            : 31;
        const symbol = passed
          ? "✓"
          : cancelled
            ? "−"
            : item.status === "ungraded"
              ? "◇"
              : "✗";
        line(
          `  ${paint(code, symbol)} ${text(names.get(item.caseId) ?? item.caseId)} ${paint(90, `[${text(item.caseId)}] #${item.repetition} · ${duration(item.durationMs)}`)} ${paint(`${code};1`, item.status.toUpperCase())}`,
        );
        line();
      }
      render();
    },
    finish(result: EvalRunResult) {
      stop();
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
      const successful = result.status === "passed";
      const code = successful
        ? 32
        : result.status === "cancelled" || result.status === "ungraded"
          ? 33
          : 31;
      line();
      if (color) {
        line(
          paint(
            code,
            `  ${progressBar(result.cases.length, result.cases.length, Math.min(22, columns() - 3))} ${result.cases.length}/${result.cases.length}`,
          ),
        );
        line(
          paint(
            `${code};1`,
            `  ${successful ? "✓ SUITE PASSED" : `◇ SUITE ${result.status.toUpperCase()}`}`,
          ),
        );
      }
      line(
        `  ${paint(result.counts.passed ? 32 : 90, `${result.counts.passed} passed`)} · ${paint(result.counts.failed ? 31 : 90, `${result.counts.failed} failed`)} · ${paint(result.counts.error ? 31 : 90, `${result.counts.error} errors`)} · ${paint(result.counts.cancelled ? 33 : 90, `${result.counts.cancelled} cancelled`)}${result.counts.ungraded ? ` · ${paint(33, `${result.counts.ungraded} ungraded`)}` : ""}`,
      );
      line(
        paint(
          90,
          `  Duration ${duration(result.durationMs)} · ${result.cases.length} ${result.cases.length === 1 ? "attempt" : "attempts"}`,
        ),
      );
      line();
    },
    pause() {
      paused = true;
      clear();
    },
    resume() {
      paused = false;
      render();
    },
    close: stop,
  };
}
