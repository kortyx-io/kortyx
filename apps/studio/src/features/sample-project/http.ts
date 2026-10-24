import {
  createSampleProjectReadModels,
  emptyEvalLiveProjection,
  projectEvalProgress,
} from "@kortyx/telemetry-db/sample-project";
import "server-only";
import {
  DiagnosticResponseSchema,
  EVALUATION_TABLE_FILTER_FIELDS,
  matchesTableFilters,
  PROMPT_TABLE_FILTER_FIELDS,
  readStudioTableFilters,
  resolveStudioTimeRange,
  STUDIO_TABLE_FIELDS,
  STUDIO_TABLE_SORT_FIELDS,
  StudioContextResponseSchema,
  type StudioTableResource,
  SAMPLE_PROJECT as sample,
  type TableFilterDefinition,
  TableFiltersSchema,
  type TableFilterValue,
  tablePassRate,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import { sampleEvaluationComparison } from "./comparison";
import { readSampleDataset } from "./data";
import { samplePath } from "./routing";

type Row = Record<string, unknown>;
function field(row: Row, key: string): TableFilterValue | TableFilterValue[] {
  const aliases: Record<string, string> = {
    versions: "declaredVersion",
    workflow: "workflowId",
    duration: "durationMs",
    created: "createdAt",
    started: "startedAt",
    activity: "lastActivityAt",
    name: "name",
  };
  if (key === "execution") return row.parentRunId ? "child" : "root";
  if (key === "feedback") return "unrated";
  const counts =
    row.counts && typeof row.counts === "object"
      ? (row.counts as Record<string, number>)
      : {};
  const derived: Row = {
    ...row,
    ...counts,
    application: row.targetName,
    applicationId: row.targetId,
    passRate: tablePassRate({
      passed: counts.passed ?? 0,
      failed: counts.failed ?? 0,
      error: counts.error ?? 0,
    }),
    liveVersion: Array.isArray(row.assignments)
      ? row.assignments.find((a) => a.tag === "live")?.version
      : undefined,
    trigger: (row.metadata as Row | undefined)?.source,
    judge: (row.judge as Row | undefined)?.id,
    judgeVersion: (row.judge as Row | undefined)?.version,
    cost:
      ((row.costs as Row | undefined)?.total as Row | undefined)?.amount ??
      row.cost,
    queueMs:
      row.startedAt && row.createdAt
        ? Date.parse(String(row.startedAt)) - Date.parse(String(row.createdAt))
        : null,
    assignedVersions: Array.isArray(row.assignments)
      ? row.assignments.map((a) => `${a.tag}@v${a.version}`)
      : [],
    versionsBehindLive:
      Array.isArray(row.assignments) &&
      row.assignments.some((a) => a.tag === "live")
        ? Number(row.latestVersion) -
          Number(row.assignments.find((a) => a.tag === "live")?.version)
        : undefined,
    assignedTags: Array.isArray(row.assignments)
      ? row.assignments.map((assignment) => String(assignment.tag))
      : [],
  };
  const value = derived[aliases[key] ?? key];
  if (Array.isArray(value))
    return value.filter((v): v is string | number | boolean =>
      ["string", "number", "boolean"].includes(typeof v),
    );
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : null;
}
function page<T extends Row>(
  rows: T[],
  params: URLSearchParams,
  resource?: StudioTableResource,
  fields?: readonly TableFilterDefinition[],
) {
  const query = Object.fromEntries(params);
  const filters = resource
    ? readStudioTableFilters(query, resource)
    : fields && query.tableFilters
      ? validateTableFilters(
          TableFiltersSchema.parse(JSON.parse(query.tableFilters)),
          fields,
        )
      : undefined;
  const range = resolveStudioTimeRange(query, new Date(sample.referenceTime));
  if (!range.ok) throw new Error(range.error);
  const selected = rows.filter((row) => {
    if (
      query.env &&
      row.environment !== undefined &&
      query.env !== row.environment
    )
      return false;
    if (
      query.q &&
      !JSON.stringify(row).toLowerCase().includes(query.q.toLowerCase())
    )
      return false;
    const time = String(
      row.startedAt ?? row.lastActivityAt ?? row.createdAt ?? "",
    );
    if (
      time &&
      ((range.value.startedAfter && time < range.value.startedAfter) ||
        (range.value.startedBefore && time > range.value.startedBefore))
    )
      return false;
    return (
      !filters ||
      matchesTableFilters(
        filters,
        (key) => field(row, key),
        resource ? STUDIO_TABLE_FIELDS[resource] : fields,
      )
    );
  });
  const sortFields: Readonly<Record<string, string>> = resource
    ? STUDIO_TABLE_SORT_FIELDS[resource]
    : {};
  const sort = sortFields[query.sort ?? ""] ?? query.sort ?? "startedAt";
  selected.sort((a, b) => {
    const av = field(a, sort),
      bv = field(b, sort);
    if (av == null || av === "") return bv == null || bv === "" ? 0 : 1;
    if (bv == null || bv === "") return -1;
    const order =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
    return (
      (query.dir === "asc" ? 1 : -1) * order ||
      String(a.id).localeCompare(String(b.id))
    );
  });
  const cursor = Math.max(0, Math.floor(Number(query.cursor) || 0));
  const size = Math.max(
    1,
    Math.min(100, Math.floor(Number(query.pageSize ?? query.limit) || 20)),
  );
  return {
    rows: selected.slice(cursor, cursor + size),
    totalCount: selected.length,
  };
}

/** The only sample read dispatcher. No branch can reach a customer API or DB. */
export function sampleResponse(path: string, method = "GET"): Response {
  const json = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: {
        "cache-control": "private, no-store",
        "x-kortyx-sample-version": String(sample.version),
      },
    });
  if (method !== "GET" && method !== "HEAD")
    return json(
      {
        error: "SAMPLE_PROJECT_READ_ONLY",
        message:
          "Sample project is read-only. Switch to your project to make changes.",
      },
      403,
    );
  const { pathname, searchParams: params } = new URL(
    path,
    "http://sample.local",
  );
  const data = readSampleDataset();
  const parts = pathname.replace(/^\/v1\/studio\/?/, "").split("/");
  const [resource, encodedId] = parts;
  let id: string | undefined;
  const updatedAt = sample.referenceTime;
  try {
    id = encodedId ? decodeURIComponent(encodedId) : undefined;
    if (resource === "context")
      return json(
        StudioContextResponseSchema.parse({
          organization: { name: "Kortyx sample" },
          project: { name: sample.name },
          environments: ["sample"],
          apiKey: null,
          api: { status: "ok", service: "kortyx-api", version: "sample-v1" },
        }),
      );
    if (resource === "catalogs") return json(data.catalogs);
    if (resource === "diagnostics" && parts.length === 2) {
      if (!id || !/^[a-f0-9-]{36}$/i.test(id) || !params.get("env"))
        return json({ error: "invalid_diagnostic" }, 400);
      const diagnostic = data.diagnostics.find(
        (item) =>
          item.manifest.diagnosticId === id &&
          item.manifest.environment === params.get("env"),
      );
      if (diagnostic) return json(diagnostic);
    }
    if (resource === "runs") {
      if (!id) {
        const rows =
          params.get("includeChildren") === "true"
            ? [...data.runs, ...data.childRuns]
            : data.runs;
        const result = page(rows, params, "runs");
        return json({ runs: result.rows, totalCount: result.totalCount });
      }
      const run = [...data.runs, ...data.childRuns].find(
        (item) => item.id === id,
      );
      if (run && parts.length === 2)
        return json({
          run,
          events: data.detailEvents.filter((event) =>
            run.parentRunId
              ? event.runId === run.parentRunId &&
                event.payload.invocationId === run.invocationId
              : event.runId === id,
          ),
          session:
            data.sessions.find((session) => session.id === run.sessionId) ??
            null,
          interrupts: data.interrupts.filter(
            (interrupt) => interrupt.runId === id,
          ),
          canReview: false,
          scores: [],
          updatedAt,
        });
    }
    if (resource === "sessions") {
      if (!id) {
        const result = page(data.sessions, params, "sessions");
        return json({ sessions: result.rows, totalCount: result.totalCount });
      }
      const session = data.sessions.find((item) => item.id === id);
      if (session && parts.length === 2)
        return json({
          session,
          runs: data.runs.filter((run) => run.sessionId === id),
          events: data.detailEvents.filter((event) => event.sessionId === id),
          interrupts: data.interrupts.filter(
            (interrupt) => interrupt.sessionId === id,
          ),
          updatedAt,
        });
    }
    if (resource === "interrupts") {
      if (!id) {
        const result = page(data.interrupts, params, "interrupts");
        return json({ interrupts: result.rows, totalCount: result.totalCount });
      }
      const interrupt = data.interrupts.find((item) => item.id === id);
      if (interrupt && parts.length === 2)
        return json({
          interrupt,
          events: data.detailEvents.filter(
            (event) => event.runId === interrupt.runId,
          ),
          run: data.runs.find((run) => run.id === interrupt.runId) ?? null,
          session:
            data.sessions.find(
              (session) => session.id === interrupt.sessionId,
            ) ?? null,
          updatedAt,
        });
    }
    if (resource === "workflows") {
      const range = resolveStudioTimeRange(
        Object.fromEntries(params),
        new Date(sample.referenceTime),
      );
      if (!range.ok) throw new Error(range.error);
      const workflow = params.get("workflow");
      const version = params.get("version");
      const runs = page(
        data.runs,
        new URLSearchParams({ ...Object.fromEntries(params), pageSize: "100" }),
        "runs",
      ).rows;
      const workflows = data.workflows.workflows.filter(
        (item) =>
          (!workflow || item.id === workflow) &&
          (!version || item.versions.includes(version)) &&
          (!params.get("env") || params.get("env") === "sample"),
      );
      const projected = createSampleProjectReadModels({
        runIds: runs.map((run) => run.id),
      });
      // Recompute metrics for the selected cohort using the production projector.
      return json({
        ...projected.workflows,
        workflows: projected.workflows.workflows.filter((item) =>
          workflows.some((workflow) => workflow.id === item.id),
        ),
        cohort: { ...range.value, workflowId: workflow, version },
      });
    }
    if (resource === "prompts") {
      if (!id || id === "library") {
        const library = data.prompts.library;
        const q = (params.get("search") ?? params.get("q"))?.toLowerCase();
        const assets = library.assets.filter(
          (asset) =>
            (!q || `${asset.name} ${asset.key}`.toLowerCase().includes(q)) &&
            params.get("archived") !== "true" &&
            !params.get("categoryId"),
        );
        const result = page(
          assets,
          new URLSearchParams({ ...Object.fromEntries(params), q: q ?? "" }),
          undefined,
          PROMPT_TABLE_FILTER_FIELDS,
        );
        return json({
          ...library,
          assets: result.rows,
          totalCount: result.totalCount,
        });
      }
      const prompt = data.prompts.details.find(
        (detail) =>
          detail.asset.id === parts[2] ||
          detail.asset.key === decodeURIComponent(parts[2] ?? ""),
      );
      if (
        id === "assets" &&
        prompt &&
        (parts.length === 3 || (parts.length === 4 && parts[3] === "tables"))
      ) {
        if (parts[3] === "tables")
          return json({ runs: [], evaluations: [], evidence: [] });
        return json(prompt);
      }
      if (id === "filter-values") return json({ values: [] });
    }
    if (resource === "evals") {
      if (id === "targets") return json(data.evals.targets);
      if (id === "capabilities") return json({ canRun: false });
      if (id === "runs" && (parts[3] === "live" || parts[3] === "case")) {
        const detail = data.evals.runs.find((item) => item.run.id === parts[2]);
        if (!detail)
          return json({ error: "Sample evaluation unavailable." }, 404);
        const run = detail.run;
        if (parts[3] === "case") {
          const matches = (item: { caseId: string; repetition: number }) =>
            item.caseId === params.get("caseId") &&
            item.repetition === Number(params.get("repetition"));
          return json({
            run: {
              ...run,
              result: run.result
                ? { ...run.result, cases: run.result.cases.filter(matches) }
                : null,
              events: run.events.filter(({ event }) =>
                event.type === "case-completed"
                  ? matches(event.result)
                  : "caseId" in event && matches(event),
              ),
            },
          });
        }
        const projection = emptyEvalLiveProjection();
        for (const { event } of run.events)
          projectEvalProgress(projection, event);
        for (const result of run.result?.cases ?? [])
          projectEvalProgress(projection, { type: "case-completed", result });
        const { events: _, result: __, caseCosts: ___, ...metadata } = run;
        const version = "0".repeat(64);
        const live = {
          ...metadata,
          version,
          errors: run.result?.errors ?? [],
          cases: Object.values(projection.attempts).map((a) => ({
            ...a.summary,
            costs:
              run.caseCosts?.[`${a.summary.caseId}:${a.summary.repetition}`],
          })),
        };
        if (params.has("after")) {
          const { suite: ____, request: _____, ...state } = live;
          return json({
            version,
            run: params.get("after") === version ? null : state,
          });
        }
        return json({ run: live });
      }
      if (id === "runs" && !parts[2])
        return json({ runs: data.evals.runs.map((detail) => detail.run) });
      if (id === "runs" && parts.length === 3) {
        const detail = data.evals.runs.find(
          (detail) => detail.run.id === parts[2],
        );
        if (detail) return json(detail);
      }
      if (id === "evaluations" && (!parts[2] || parts[2] === "table")) {
        const result = page(
          data.evals.evaluations.map((evaluation) => evaluation.detail.run),
          params,
          undefined,
          EVALUATION_TABLE_FILTER_FIELDS,
        );
        return json({ runs: result.rows, totalCount: result.totalCount });
      }
      if (
        id === "evaluations" &&
        (parts.length === 3 ||
          (parts.length === 4 && ["results", "comparison"].includes(parts[3])))
      ) {
        const evaluation = data.evals.evaluations.find(
          (evaluation) => evaluation.detail.run.id === parts[2],
        );
        if (evaluation)
          return json(
            parts[3] === "comparison"
              ? { run: sampleEvaluationComparison(evaluation.results.run) }
              : parts[3] === "results"
                ? evaluation.results
                : evaluation.detail,
          );
      }
    }
    if (resource === "filter-values") {
      const requested = params.get("resource");
      const rows =
        requested === "sessions"
          ? data.sessions
          : requested === "interrupts"
            ? data.interrupts
            : data.runs;
      const key = params.get("field") ?? "";
      const values = [
        ...new Set(
          rows
            .flatMap((row) => [field(row, key)].flat())
            .filter((value) => value !== null),
        ),
      ];
      return json({
        values: values
          .filter((value) =>
            String(value)
              .toLowerCase()
              .includes(
                (params.get("q") ?? params.get("search") ?? "").toLowerCase(),
              ),
          )
          .map(String),
      });
    }
    if (resource === "changes") return new Response(null, { status: 204 });
  } catch {
    return json(
      {
        error: "INVALID_SAMPLE_QUERY",
        message: "The sample query is invalid.",
      },
      400,
    );
  }
  return json(
    {
      error: "NOT_FOUND",
      message: "This record is not in the sample project.",
    },
    404,
  );
}

export async function sampleBrowserResponse(request: Request) {
  const url = new URL(request.url);
  const path = samplePath(url.pathname)
    .replace(/^\/api\/studio/, "/v1/studio")
    .replace(/\/prompts\/library$/, "/prompts");
  const response = sampleResponse(`${path}${url.search}`, request.method);
  if (path.startsWith("/v1/studio/diagnostics/") && response.ok) {
    const diagnostic = DiagnosticResponseSchema.parse(await response.json());
    return new Response(JSON.stringify(diagnostic.content), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="diagnostic-${diagnostic.manifest.diagnosticId}.json"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-kortyx-sample-version": String(sample.version),
      },
    });
  }
  return response;
}
