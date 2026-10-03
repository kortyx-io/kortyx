export const evalCaseHref = (run: string, caseId: string, repetition: number) =>
  `/evals/cases/${encodeURIComponent(run)}/${encodeURIComponent(caseId)}/${repetition}`;
export const evalComparisonCaseHref = (
  run: string,
  caseId: string,
  baseline: string,
) =>
  `/evals/cases/${encodeURIComponent(run)}/${encodeURIComponent(caseId)}/compare?baseline=${encodeURIComponent(baseline)}`;

/** Upgrade the old inline case selection to the shareable comparison detail. */
export function comparisonSelectionHref(
  run: string,
  params: Record<string, string | string[] | undefined>,
) {
  if (typeof params.case !== "string" || typeof params.baseline !== "string")
    return null;
  const [path] = evalComparisonCaseHref(
    run,
    params.case,
    params.baseline,
  ).split("?", 1);
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "case" && typeof value === "string") next.set(key, value);
  }
  return `${path}?${next}`;
}
export const evalRunHref = (id: string) =>
  `/evals/runs/${encodeURIComponent(id)}`;
export const evalSuiteHref = (target: string, suite: string) =>
  `/evals/suites/${encodeURIComponent(target)}/${encodeURIComponent(suite)}`;
export function evalCompareHref(candidate: string, baseline?: string) {
  const path = `${evalRunHref(candidate)}/compare`;
  return baseline ? `${path}?baseline=${encodeURIComponent(baseline)}` : path;
}
export function legacyEvalHref(
  params: Record<string, string | string[] | undefined>,
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && !["run", "compare", "view"].includes(key))
      next.set(key, value);
  }
  const run = typeof params.run === "string" ? params.run : undefined;
  const compare =
    typeof params.compare === "string" ? params.compare : undefined;
  let path = run
    ? compare
      ? `${evalRunHref(run)}/compare`
      : evalRunHref(run)
    : params.view === "suites"
      ? "/evals/suites"
      : "/evals/runs";
  const caseKey = typeof params.case === "string" ? params.case : undefined;
  if (run && !compare && caseKey) {
    const separator = caseKey.lastIndexOf(":");
    const repetition = Number(caseKey.slice(separator + 1));
    if (separator > 0 && Number.isInteger(repetition) && repetition > 0)
      path = evalCaseHref(run, caseKey.slice(0, separator), repetition);
  }
  if (run && compare) next.set("baseline", compare);
  return `${path}${next.size ? `?${next}` : ""}`;
}

/** Carry list navigation state between eval routes, without stale inspector/launch selections. */
export function evalNavigationHref(
  path: string,
  current: Pick<URLSearchParams, "toString">,
) {
  const [pathname, explicit] = path.split("?", 2);
  const previous = new URLSearchParams(current.toString());
  const next = new URLSearchParams();
  for (const key of [
    "live",
    "q",
    "application",
    "status",
    "sort",
    "dir",
    "cursor",
    "pageSize",
  ])
    if (previous.has(key)) next.set(key, previous.get(key) ?? "");
  for (const [key, value] of new URLSearchParams(explicit))
    next.set(key, value);
  return `${pathname}${next.size ? `?${next}` : ""}`;
}
