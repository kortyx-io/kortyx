export const evalCaseHref = (run: string, caseId: string, repetition: number) =>
  `/experiments/cases/${encodeURIComponent(run)}/${encodeURIComponent(caseId)}/${repetition}`;
export const evalComparisonCaseHref = (
  run: string,
  caseId: string,
  baseline: string,
) =>
  `/experiments/cases/${encodeURIComponent(run)}/${encodeURIComponent(caseId)}/compare?baseline=${encodeURIComponent(baseline)}`;

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
  `/experiments/runs/${encodeURIComponent(id)}`;
export const evaluationHref = (id: string) =>
  `/experiments/${encodeURIComponent(id)}`;
export function evaluationCompareHref(
  id: string,
  baseline?: string,
  suiteId?: string,
) {
  const path = `${evaluationHref(id)}/compare`;
  const params = new URLSearchParams();
  if (baseline) params.set("baseline", baseline);
  if (suiteId) params.set("suiteId", suiteId);
  return `${path}${params.size ? `?${params}` : ""}`;
}
/** Consumer dataset IDs are unique within a target, not across a project. */
export const evalSuiteHref = (target: string, suite: string) =>
  `/datasets/${encodeURIComponent(JSON.stringify([target, suite]))}`;

export function parseDatasetId(segment: string): [string, string] | null {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(segment));
    return Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
      ? [value[0], value[1]]
      : null;
  } catch {
    return null;
  }
}

export function legacyEvalDetailHref(
  segments: string[],
  params: Record<string, string | string[] | undefined>,
) {
  const [resource, first, second, third] = segments;
  let path: string;
  if (segments.length === 1 && ["runs", "suites", "cases"].includes(resource)) {
    path = resource === "suites" ? "/datasets" : "/experiments";
  } else if (resource === "suites" && segments.length === 3) {
    path = evalSuiteHref(first, second);
  } else if (
    (resource === "runs" || resource === "evaluations") &&
    (segments.length === 2 || (segments.length === 3 && second === "compare"))
  ) {
    path = resource === "runs" ? evalRunHref(first) : evaluationHref(first);
    if (second === "compare") path += "/compare";
  } else if (resource === "cases" && segments.length === 4) {
    path = `/experiments/cases/${[first, second, third].map(encodeURIComponent).join("/")}`;
  } else if (resource === "judges" && segments.length === 3) {
    path = `/experiments/judges/${encodeURIComponent(first)}/${encodeURIComponent(second)}`;
  } else {
    return null;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const item of Array.isArray(value) ? value : [value])
      if (item !== undefined) query.append(key, item);
  return `${path}${query.size ? `?${query}` : ""}`;
}
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
      ? "/datasets"
      : "/experiments";
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
    "env",
    "q",
    "application",
    "status",
    "sort",
    "dir",
    "cursor",
    "pageSize",
  ])
    if (previous.has(key)) next.set(key, previous.get(key) ?? "");
  for (const [key, value] of previous)
    if (key === "tableFilters" || key.startsWith("tableFilters."))
      next.set(key, value);
  for (const [key, value] of new URLSearchParams(explicit))
    next.set(key, value);
  return `${pathname}${next.size ? `?${next}` : ""}`;
}
