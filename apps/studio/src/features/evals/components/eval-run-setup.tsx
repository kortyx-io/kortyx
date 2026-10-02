"use client";
import { Play } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evalRequest } from "../api/client";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref, evalRunHref } from "../lib/navigation";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";
import { EvalDisclosure } from "./eval-disclosure";
import { EvalDropdown } from "./eval-dropdown";
import { EvalSuiteDefinition } from "./eval-suite-definition";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetId = query.launchApplication;
  const suiteId = query.launchSuite;
  const attempts = Number(query.launchAttempts);
  const allowedIds = (
    query.launchCases ??
    suite?.cases.map((c) => c.id) ??
    []
  ).filter((id) => suite?.cases.some((c) => c.id === id));
  const onRun = async () => {
    if (!suite || !target) return;
    setWorking(true);
    setError("");
    try {
      const run = await evalRequest("runs", {
        targetId,
        suiteId,
        suiteRevision: target.revisions[suiteId],
        caseIds: allowedIds,
        repetitions: attempts,
        concurrency: 1,
      });
      router.push(evalNavigationHref(evalRunHref(run.id), searchParams));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start this eval run.",
      );
    } finally {
      setWorking(false);
    }
  };
  const valid =
    Number.isInteger(attempts) &&
    attempts >= 1 &&
    attempts <= 20 &&
    allowedIds.length > 0 &&
    allowedIds.length * attempts <= 200;
  const chooseSuite = (id: string, application = target) => {
    void setQuery({
      launchSuite: id,
      launchApplication: application?.id ?? "",
      launchCases: null,
    });
  };
  return (
    <DetailInspectorDrawer
      open={query.launch && pathname === matchPath}
      onClose={close}
      title="Run an eval suite"
      description="Execute conversations with the application’s test setup."
      closeLabel="Close run setup"
      bodyClassName="flex flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400"
          >
            {error}
          </p>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-medium">Application</p>
          <EvalDropdown
            label="Application"
            value={targetId}
            disabled={working}
            className="w-full"
            options={targets.targets.map((t) => ({
              value: t.id,
              label: `${t.name} · ${t.environment}`,
            }))}
            onChange={(id) => {
              const next = targets.targets.find((t) => t.id === id);
              chooseSuite(next?.manifest?.suites[0]?.id ?? "", next);
            }}
          />
        </div>
        {target?.error ? (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            {target.error}
          </p>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-medium">Suite</p>
          <EvalDropdown
            label="Suite"
            value={suiteId}
            disabled={working}
            className="w-full"
            options={
              target?.manifest?.suites.map((s) => ({
                value: s.id,
                label: s.name ?? displayName(s.id),
              })) ?? []
            }
            onChange={(id) => chooseSuite(id)}
          />
        </div>
        <fieldset disabled={working} className="space-y-2">
          <legend className="mb-2 text-xs font-medium">
            Conversations · {allowedIds.length} selected
          </legend>
          {suite?.cases.map((c) => (
            <label
              key={c.id}
              className="flex items-start gap-3 rounded-md border p-3"
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-foreground"
                checked={allowedIds.includes(c.id)}
                onChange={(event) => {
                  void setQuery({
                    launchCases: event.target.checked
                      ? [...allowedIds, c.id]
                      : allowedIds.filter((id) => id !== c.id),
                  });
                }}
              />
              <span className="min-w-0">
                <span className="block break-words text-sm">
                  {c.name ?? displayName(c.id)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.steps.length} {c.steps.length === 1 ? "step" : "steps"} ·{" "}
                  {c.steps.some((step) => step.expect.type === "interrupt")
                    ? "Includes human input"
                    : "Answer evaluation"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
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
          <p className="text-xs text-muted-foreground">
            Each attempt runs in an independent session. Between 1 and 20
            attempts, up to 200 total.
          </p>
        </div>
        {suite ? (
          <EvalDisclosure
            scope="launch-definition"
            label="Review conversation definitions"
          >
            <EvalSuiteDefinition scope="launch-definition" suite={suite} />
          </EvalDisclosure>
        ) : null}
        {!targets.canRun ? (
          <p className="text-xs text-muted-foreground">
            This Studio connection can inspect results. Execution requires
            eval:run permission.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
        <p className="text-xs text-muted-foreground">
          {allowedIds.length}{" "}
          {allowedIds.length === 1 ? "conversation" : "conversations"} ·{" "}
          {valid ? allowedIds.length * attempts : "—"}{" "}
          {valid && allowedIds.length * attempts === 1 ? "attempt" : "attempts"}
        </p>
        <Button
          disabled={
            !targets.canRun ||
            !suite ||
            Boolean(target?.error) ||
            !valid ||
            working
          }
          onClick={() => {
            void onRun();
          }}
        >
          <Play />
          {working ? "Starting…" : "Run suite"}
        </Button>
      </div>
    </DetailInspectorDrawer>
  );
}
