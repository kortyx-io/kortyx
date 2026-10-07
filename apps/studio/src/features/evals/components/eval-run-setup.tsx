"use client";
import { Play } from "lucide-react";
import { useRef, useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "@/lib/scoped-navigation";
import { evalRequest } from "../api/client";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref } from "../lib/navigation";
import type { EvalTargets } from "../schema";
import { EvalDropdown } from "./eval-dropdown";
import { EvalSuiteSelection } from "./eval-suite-selection";

export function EvalRunSetup({
  targets,
  matchPath,
}: {
  targets: EvalTargets;
  matchPath: string;
}) {
  const {
    query,
    setQuery,
    target,
    suite,
    judge,
    studioAvailable,
    appJudge,
    close,
  } = useEvalSetup(targets);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const launch = useRef<{ body: string; key: string } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const all = query.launchScope === "all";
  const available = target?.manifest?.suites ?? [];
  const selectedIds =
    query.launchSuites ?? (query.launchSuite ? [query.launchSuite] : []);
  const casesFor = (item: (typeof available)[number]) => {
    if (all) return item.cases.map((conversation) => conversation.id);
    if (!selectedIds.includes(item.id)) return [];
    const ids =
      query.launchSuiteCases?.find((selection) => selection.suiteId === item.id)
        ?.caseIds ??
      (suite?.id === item.id ? query.launchCases : null) ??
      item.cases.map((conversation) => conversation.id);
    return ids.filter((id) =>
      item.cases.some((conversation) => conversation.id === id),
    );
  };
  const selected = available.filter((item) => casesFor(item).length > 0);
  const expanded = query.launchExpandedSuites ?? [];
  const setSuiteCases = (suiteId: string, caseIds: string[]) => {
    const selections = available
      .map((item) => ({
        suite: item,
        caseIds: item.id === suiteId ? caseIds : casesFor(item),
      }))
      .filter((item) => item.caseIds.length > 0);
    const partial = selections
      .filter((item) => item.caseIds.length !== item.suite.cases.length)
      .map((item) => ({ suiteId: item.suite.id, caseIds: item.caseIds }));
    void setQuery({
      launchSuite: "",
      launchSuites: selections.map((item) => item.suite.id),
      launchCases: null,
      launchSuiteCases: partial.length ? partial : null,
    });
  };
  const attempts = Number(query.launchAttempts);
  const concurrency = Number(query.launchConcurrency);
  const count = selected.reduce((sum, item) => sum + casesFor(item).length, 0);
  const total = count * attempts;
  const judgeAvailable =
    judge === "app" ? Boolean(appJudge) : judge === "studio" && studioAvailable;
  const studioUnavailableReason = !targets.studioJudge
    ? "No Studio judge is configured on this backend."
    : !target?.manifest?.studioJudging
      ? "This application's SDK does not support Studio judging."
      : undefined;
  const valid =
    selected.length > 0 &&
    Number.isInteger(attempts) &&
    attempts >= 1 &&
    attempts <= 20 &&
    Number.isInteger(concurrency) &&
    concurrency >= 1 &&
    concurrency <= 4 &&
    count > 0 &&
    total <= 1000 &&
    selected.every((item) => casesFor(item).length * attempts <= 100);
  const onRun = async () => {
    if (!target || !judge || !valid || !judgeAvailable || working) return;
    setWorking(true);
    setError("");
    const body = {
      targetId: target.id,
      selection: query.launchScope,
      suites: selected.map((item) => ({
        suiteId: item.id,
        suiteRevision: target.revisions[item.id],
        ...(!all ? { caseIds: casesFor(item) } : {}),
      })),
      judge,
      repetitions: attempts,
      concurrency,
      metadata: { source: "manual" },
    };
    const serialized = JSON.stringify(body);
    if (launch.current?.body !== serialized)
      launch.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const run = await evalRequest("evaluations", {
        ...body,
        idempotencyKey: launch.current.key,
      });
      router.push(evalNavigationHref(`/evals/evaluations/${run.id}`, search));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start evaluations.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <DetailInspectorDrawer
      open={query.launch && pathname === matchPath}
      onClose={() => {
        launch.current = null;
        close();
      }}
      title="Run evaluations"
      description="Run all or selected suites against one application environment."
      closeLabel="Close run setup"
      bodyClassName="flex flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        {error || target?.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400"
          >
            {error || target?.error}
          </p>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-medium">Application · Environment</p>
          <EvalDropdown
            label="Application"
            value={target?.id ?? ""}
            disabled={working}
            className="w-full"
            options={targets.targets.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.environment}`,
            }))}
            onChange={(id) => {
              void setQuery({
                launchApplication: id,
                launchScope: "all",
                launchSuite: "",
                launchSuites: null,
                launchCases: null,
                launchSuiteCases: null,
                launchExpandedSuites: null,
                launchJudge: null,
              });
            }}
          />
        </div>
        <fieldset disabled={working} className="space-y-2">
          <legend className="mb-2 text-xs font-medium">Suites</legend>
          <div className="flex gap-4 text-sm">
            {(["all", "selected"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eval-scope"
                  value={value}
                  checked={query.launchScope === value}
                  onChange={() => {
                    void setQuery({ launchScope: value });
                  }}
                />
                {value === "all"
                  ? `All suites (${available.length})`
                  : "Selected suites"}
              </label>
            ))}
          </div>
          {!all ? (
            available.map((item) => (
              <EvalSuiteSelection
                key={item.id}
                suite={item}
                selected={casesFor(item)}
                expanded={expanded.includes(item.id)}
                disabled={working}
                onExpand={() => {
                  void setQuery({
                    launchExpandedSuites: expanded.includes(item.id)
                      ? expanded.filter((id) => id !== item.id)
                      : [...expanded, item.id],
                  });
                }}
                onChange={(ids) => setSuiteCases(item.id, ids)}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground">
              Every registered suite runs all its conversations.
            </p>
          )}
        </fieldset>
        <div className="space-y-2">
          <p className="text-xs font-medium">Judge</p>
          <EvalDropdown
            label="Judge"
            value={judge ?? ""}
            disabled={working}
            className="w-full"
            options={[
              {
                value: "studio",
                label: "Studio judge",
                disabled: !studioAvailable,
                description: studioUnavailableReason,
              },
              {
                value: "app",
                label: "App judge",
                disabled: !appJudge,
                description: !appJudge
                  ? "No App judge configured by this application."
                  : undefined,
              },
            ]}
            onChange={(value) => {
              if (value === "app" || value === "studio")
                void setQuery({ launchJudge: value });
            }}
          />
          <p className="break-words text-xs text-muted-foreground">
            {judge === "app"
              ? appJudge
                ? `${appJudge.id} · ${appJudge.version}`
                : "No App judge configured by this application."
              : judge === "studio"
                ? studioAvailable
                  ? `${targets.studioJudge?.id} · ${targets.studioJudge?.version}`
                  : studioUnavailableReason
                : "No judge is available for this application environment."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label htmlFor="eval-repetitions" className="text-xs font-medium">
              Attempts per conversation
            </label>
            <Input
              id="eval-repetitions"
              type="number"
              min={1}
              max={20}
              value={query.launchAttempts}
              disabled={working}
              onChange={(e) => {
                void setQuery({ launchAttempts: e.target.value });
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="eval-concurrency" className="text-xs font-medium">
              Concurrent attempts per suite
            </label>
            <Input
              id="eval-concurrency"
              type="number"
              min={1}
              max={4}
              value={query.launchConcurrency}
              disabled={working}
              onChange={(e) => {
                void setQuery({ launchConcurrency: e.target.value });
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Each attempt uses an independent session. Up to 100 attempts per suite
          and 1,000 per evaluation.
        </p>
        {!valid && selected.length > 0 ? (
          <output className="block text-xs text-muted-foreground">
            Select at least one conversation and use the attempt limits above.
          </output>
        ) : null}
        {!targets.canRun ? (
          <p className="text-xs text-muted-foreground">
            Execution requires eval:run permission.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
        <p className="text-xs text-muted-foreground">
          {selected.length} suites · {count} conversations ·{" "}
          {Number.isFinite(total) ? total : "—"} attempts
        </p>
        <Button
          disabled={working || !targets.canRun || !valid || !judgeAvailable}
          onClick={() => void onRun()}
        >
          <Play className="mr-2 size-3.5" />
          {working ? "Starting…" : "Run evaluations"}
        </Button>
      </div>
    </DetailInspectorDrawer>
  );
}
