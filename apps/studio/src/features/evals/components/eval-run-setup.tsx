"use client";
import { Play } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evalRequest } from "../api/client";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref } from "../lib/navigation";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";
import { EvalDropdown } from "./eval-dropdown";

export function EvalRunSetup({
  targets,
  matchPath,
}: {
  targets: EvalTargets;
  matchPath: string;
}) {
  const { query, setQuery, target, suite, close } = useEvalSetup(targets);
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
  const selected = all
    ? available
    : available.filter((suite) => selectedIds.includes(suite.id));
  const cases = suite
    ? (query.launchCases ?? suite.cases.map((item) => item.id)).filter((id) =>
        suite.cases.some((item) => item.id === id),
      )
    : [];
  const attempts = Number(query.launchAttempts);
  const concurrency = Number(query.launchConcurrency);
  const count = selected.reduce(
    (sum, item) =>
      sum + (suite?.id === item.id ? cases.length : item.cases.length),
    0,
  );
  const total = count * attempts;
  const appJudge = target?.manifest?.judge;
  const studioAvailable = Boolean(
    target?.manifest?.studioJudging && targets.studioJudge,
  );
  const judgeAvailable =
    query.launchJudge === "app" ? Boolean(appJudge) : studioAvailable;
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
    selected.every(
      (item) =>
        (suite?.id === item.id ? cases.length : item.cases.length) * attempts <=
        100,
    );
  const onRun = async () => {
    if (!target || !valid || !judgeAvailable || working) return;
    setWorking(true);
    setError("");
    const body = {
      targetId: target.id,
      selection: query.launchScope,
      suites: selected.map((item) => ({
        suiteId: item.id,
        suiteRevision: target.revisions[item.id],
        ...(suite?.id === item.id ? { caseIds: cases } : {}),
      })),
      judge: query.launchJudge,
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
                    void setQuery({ launchScope: value, launchCases: null });
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
              <label
                key={item.id}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-foreground"
                  checked={selectedIds.includes(item.id)}
                  onChange={(event) => {
                    void setQuery({
                      launchSuite: "",
                      launchSuites: event.target.checked
                        ? [...selectedIds, item.id]
                        : selectedIds.filter((id) => id !== item.id),
                      launchCases: null,
                    });
                  }}
                />
                <span>
                  <span className="block text-sm">
                    {item.name ?? displayName(item.id)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.cases.length} conversations
                  </span>
                </span>
              </label>
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
            value={query.launchJudge}
            disabled={working}
            className="w-full"
            options={[
              {
                value: "studio",
                label: "Studio judge",
                disabled: !studioAvailable,
                description: !studioAvailable
                  ? "Studio judge unavailable. Configure the Studio backend and a compatible application SDK."
                  : undefined,
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
            {query.launchJudge === "app"
              ? appJudge
                ? `${appJudge.id} · ${appJudge.version}`
                : "No App judge configured by this application."
              : studioAvailable
                ? `${targets.studioJudge?.id} · ${targets.studioJudge?.version}`
                : "Studio judge is unavailable."}
          </p>
        </div>
        {suite ? (
          <fieldset
            aria-label="Conversations"
            disabled={working}
            className="space-y-2"
          >
            <legend className="mb-2 text-xs font-medium">
              Conversations · {cases.length} selected
            </legend>
            {suite.cases.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-foreground"
                  checked={cases.includes(item.id)}
                  onChange={(event) => {
                    void setQuery({
                      launchCases: event.target.checked
                        ? [...cases, item.id]
                        : cases.filter((id) => id !== item.id),
                    });
                  }}
                />
                <span className="text-sm">
                  {item.name ?? displayName(item.id)}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
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
