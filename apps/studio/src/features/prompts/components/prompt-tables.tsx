"use client";

import {
  type StudioEvaluationSummary,
  StudioEvaluationSummarySchema,
} from "@kortyx/agent/evals";
import {
  type PromptDetail,
  StudioRunSchema,
} from "@kortyx/telemetry-contracts";
import { RefreshCw } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringLiteral } from "nuqs";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  DataTable,
  DataTableColumnsMenu,
  DataTableProvider,
} from "@/components/data-table";
import { usePrepareDetailNavigation } from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";
import {
  createEvaluationColumns,
  type EvaluationSort,
} from "@/features/evals/components/evaluation-table-columns";
import { createRunColumns } from "@/features/runs/components/run-table-columns";
import { mapStudioRun } from "@/features/runs/lib/map-studio-run";
import type { Run, SortKey } from "@/features/runs/schema";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { useRouter, useSearchParams } from "@/lib/scoped-navigation";
import { studioDetailHref } from "@/lib/studio-routes";
import { promptRequest } from "../api/client";

const responseSchema = z.object({
  runs: z.array(StudioRunSchema),
  evaluations: z.array(StudioEvaluationSummarySchema),
});

export function PromptTables({
  id,
  version,
  kind,
  evidence,
  onTest,
  canTest,
}: {
  id: string;
  version: number;
  kind: "runs" | "evals";
  evidence: PromptDetail["evidence"];
  onTest: () => void;
  canTest: boolean;
}) {
  const [rows, setRows] = useState<{
    runs: Run[];
    evaluations: StudioEvaluationSummary[];
  }>({ runs: [], evaluations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(0);
  const [query, setQuery] = useStudioQueryStates(
    {
      q: parseAsString.withDefault(""),
      status: parseAsString.withDefault("all"),
      sort: parseAsStringLiteral([
        "name",
        "created",
        "status",
        "started",
        "duration",
        "tokens",
        "cost",
      ]).withDefault(kind === "runs" ? "started" : "created"),
      dir: parseAsStringLiteral(["asc", "desc"]).withDefault("desc"),
      cursor: parseAsInteger.withDefault(0),
      pageSize: parseAsInteger.withDefault(20),
    },
    {
      shallow: true,
      urlKeys: {
        q: `prompt${kind}Search`,
        status: `prompt${kind}Status`,
        sort: `prompt${kind}Sort`,
        dir: `prompt${kind}Dir`,
        cursor: `prompt${kind}Page`,
        pageSize: `prompt${kind}PageSize`,
      },
    },
  );
  const router = useRouter();
  const search = useSearchParams();
  const prepare = usePrepareDetailNavigation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the refresh counter restarts the authenticated read.
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = responseSchema.parse(
          await promptRequest(
            `assets/${id}/tables?version=${version}`,
            undefined,
            controller.signal,
          ),
        );
        if (controller.signal.aborted) return;
        setRows({
          runs: data.runs.map(mapStudioRun),
          evaluations: data.evaluations,
        });
        setNow(Date.now());
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load attached records.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5000);
    window.addEventListener("focus", read);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", read);
    };
  }, [id, version, refresh]);
  const active =
    kind === "runs" &&
    rows.runs.some(
      (run) =>
        run.status === "running" ||
        (run.parentRunId && run.status === "interrupted"),
    );
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const navigate = (href: string, event?: React.MouseEvent) => {
    const destination = detailNavigationHref(href, search);
    if (event?.metaKey || event?.ctrlKey)
      window.open(destination, "_blank", "noopener");
    else {
      prepare?.(destination);
      router.push(destination);
    }
  };
  const needle = query.q.toLowerCase();
  const runs = rows.runs.filter(
    (run) =>
      (query.status === "all" || run.status === query.status) &&
      `${run.id} ${run.workflow} ${run.session} ${run.model} ${run.result} ${run.environment}`
        .toLowerCase()
        .includes(needle),
  );
  const evaluations = rows.evaluations.filter(
    (run) =>
      (query.status === "all" || run.status === query.status) &&
      `${run.name} ${run.id} ${run.targetName} ${run.environment} ${run.metadata.source} ${run.metadata.commit ?? ""}`
        .toLowerCase()
        .includes(needle),
  );
  const direction = query.dir === "asc" ? 1 : -1;
  const runSort: SortKey = [
    "started",
    "duration",
    "tokens",
    "cost",
    "status",
  ].includes(query.sort)
    ? (query.sort as SortKey)
    : "started";
  const evalSort: EvaluationSort = ["name", "created", "status"].includes(
    query.sort,
  )
    ? (query.sort as EvaluationSort)
    : "created";
  runs.sort(
    (a, b) =>
      direction *
      (runSort === "started"
        ? a.startedAt.localeCompare(b.startedAt)
        : runSort === "status"
          ? a.status.localeCompare(b.status)
          : (a[runSort] ?? 0) - (b[runSort] ?? 0)),
  );
  evaluations.sort(
    (a, b) =>
      direction *
      (evalSort === "name"
        ? a.name.localeCompare(b.name)
        : evalSort === "status"
          ? a.status.localeCompare(b.status)
          : a.createdAt.localeCompare(b.createdAt)),
  );
  const size = [10, 20, 50, 100].includes(query.pageSize) ? query.pageSize : 20;
  const total = kind === "runs" ? runs.length : evaluations.length;
  const pagination = {
    cursor: Math.min(
      Math.max(0, query.cursor),
      Math.max(0, Math.ceil(total / size) - 1) * size,
    ),
    pageSize: size,
    pageSizes: [10, 20, 50, 100],
    totalCount: total,
    onCursorChange: (cursor: number) => {
      void setQuery({ cursor });
    },
    onPageSizeChange: (pageSize: number) => {
      void setQuery({ pageSize, cursor: 0 });
    },
  };
  const sort = (sort: SortKey | EvaluationSort) => {
    void setQuery({
      sort,
      dir: query.sort === sort && query.dir === "desc" ? "asc" : "desc",
      cursor: 0,
    });
  };
  const header = (
    <div className="shrink-0 space-y-3 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold">
          {kind === "runs" ? "Runs using" : "Evaluations for"} v{version}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={`Refresh prompt ${kind}`}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
          {kind === "evals" && (
            <Button
              size="sm"
              variant="outline"
              disabled={!canTest}
              onClick={onTest}
            >
              Run a suite
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Search prompt ${kind}`}
          placeholder={
            kind === "runs"
              ? "Search workflow, model or run ID…"
              : "Search evaluation runs…"
          }
          className="h-8 min-w-36 flex-1 text-xs"
          value={query.q}
          onChange={(event) => {
            void setQuery({ q: event.target.value, cursor: 0 });
          }}
        />
        <EvalDropdown
          label={`Prompt ${kind} status filter`}
          value={query.status}
          options={[
            { value: "all", label: "All statuses" },
            ...(kind === "runs"
              ? [
                  "running",
                  "completed",
                  "interrupted",
                  "incomplete",
                  "failed",
                  "cancelled",
                ]
              : ["queued", "running", "passed", "failed", "error", "cancelled"]
            ).map((value) => ({ value, label: value })),
          ]}
          onChange={(status) => {
            void setQuery({ status, cursor: 0 });
          }}
        />
        <DataTableColumnsMenu />
      </div>
      {error && (
        <div role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}{" "}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
  const empty = (
    <div className="flex min-h-64 h-full flex-col items-center justify-center p-6 text-center">
      <h3 className="text-sm font-medium">
        {loading
          ? "Loading…"
          : error
            ? "Attached records unavailable"
            : query.q || query.status !== "all"
              ? "No results match these filters"
              : kind === "runs"
                ? "No runs have reported this version."
                : "No evaluations for this version yet."}
      </h3>
      {!loading && !error && (
        <p className="mt-2 max-w-sm text-xs text-muted-foreground">
          {query.q || query.status !== "all"
            ? "Change your search or clear the filters."
            : kind === "runs"
              ? "Connect usePrompt and useReason to capture prompt provenance automatically."
              : "Test this version directly, or add it to a test group."}
        </p>
      )}
      {(query.q || query.status !== "all") && (
        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={() => {
            void setQuery({ q: "", status: "all", cursor: 0 });
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
  const columns = createRunColumns({
    now,
    onToggleStatus: (status) => {
      void setQuery({
        status: query.status === status ? "all" : status,
        cursor: 0,
      });
    },
    onCopy: (text) => {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    },
  });
  const evalColumns = [
    ...createEvaluationColumns((run) =>
      navigate(
        run.legacy ? `/evals/runs/${run.id}` : `/evals/evaluations/${run.id}`,
      ),
    ),
    {
      key: "prompt-usage",
      label: "Prompt usage",
      defaultWidth: 200,
      render: (run: StudioEvaluationSummary) => {
        const attached = evidence.filter(
          (item) => (item.evaluationId ?? item.runId) === run.id,
        );
        const states = new Set(attached.map((item) => item.usage));
        const state = states.size === 1 ? attached[0]?.usage : undefined;
        const labels = {
          verified: "Usage verified",
          pending: "Awaiting usage",
          "not-used": "Prompt was not called",
          mismatch: "Usage differs",
          "context-differs": "Companion versions differ",
        };
        return (
          <div
            className="space-y-1 text-[11px]"
            title={attached
              .map(
                (item) =>
                  `${item.suiteId} · ${labels[item.usage]} · ${item.fullSuite ? "Full suite" : "Selected tests"}${item.groupName ? ` · ${item.groupName}` : ""}${item.companions.length ? ` · Tested with ${item.companions.map((companion) => `${companion.key}@v${companion.version}`).join(", ")}` : ""}`,
              )
              .join("\n")}
          >
            <p
              className={
                state === "verified"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              }
            >
              {state
                ? labels[state]
                : attached.length
                  ? "Mixed prompt usage"
                  : "Awaiting usage"}
            </p>
            {attached.length > 1 && (
              <p className="text-muted-foreground">{attached.length} suites</p>
            )}
          </div>
        );
      },
    },
  ];
  return (
    <div data-prompt-table={kind} className="h-full min-h-0 min-w-0">
      {kind === "runs" ? (
        <DataTableProvider columns={columns}>
          <DataTable
            className="rounded-none border-0 shadow-none"
            data={runs}
            getRowKey={(run) => run.id}
            header={header}
            emptyState={empty}
            emptyStateClassName="h-full"
            pagination={pagination}
            sort={runSort}
            direction={query.dir}
            onSort={sort}
            onRowClick={(run, event) => {
              const href = studioDetailHref(
                "runs",
                run.parentRunId ?? run.id,
                run.invocationId
                  ? {
                      tab: "calls",
                      call: run.invocationId,
                      ...(run.branchId ? { branch: run.branchId } : {}),
                    }
                  : undefined,
              );
              navigate(href, event);
            }}
          />
        </DataTableProvider>
      ) : (
        <DataTableProvider columns={evalColumns}>
          <DataTable
            className="rounded-none border-0 shadow-none"
            data={evaluations}
            getRowKey={(run) => run.id}
            header={header}
            emptyState={empty}
            emptyStateClassName="h-full"
            pagination={pagination}
            sort={evalSort}
            direction={query.dir}
            onSort={sort}
            onRowClick={(run, event) =>
              navigate(
                run.legacy
                  ? `/evals/runs/${run.id}`
                  : `/evals/evaluations/${run.id}`,
                event,
              )
            }
          />
        </DataTableProvider>
      )}
    </div>
  );
}
