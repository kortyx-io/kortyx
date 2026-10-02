"use client";
import type { EvalSuite } from "@kortyx/agent/evals";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { PayloadViewer } from "@/components/detail/payload-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayName } from "../lib/presentation";
import type { EvalTargets } from "../schema";

export function EvalRunSetup({
  targets,
  selection,
  onClose,
  onRun,
  working,
  error,
}: {
  targets: EvalTargets;
  selection: { targetId: string; suiteId: string } | null;
  onClose: () => void;
  onRun: (
    targetId: string,
    suite: EvalSuite,
    caseIds: string[],
    repetitions: number,
  ) => Promise<void>;
  working: boolean;
  error?: string;
}) {
  const [targetId, setTargetId] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [repetitions, setRepetitions] = useState("1");
  useEffect(() => {
    if (!selection) return;
    setTargetId(selection.targetId);
    setSuiteId(selection.suiteId);
    const suite = targets.targets
      .find((t) => t.id === selection.targetId)
      ?.manifest?.suites.find((s) => s.id === selection.suiteId);
    setCaseIds(suite?.cases.map((c) => c.id) ?? []);
    setRepetitions("1");
  }, [selection, targets]);
  const target = targets.targets.find((t) => t.id === targetId);
  const suite = target?.manifest?.suites.find((s) => s.id === suiteId);
  const attempts = Number(repetitions);
  const allowedIds = caseIds.filter((id) =>
    suite?.cases.some((c) => c.id === id),
  );
  const valid =
    Number.isInteger(attempts) &&
    attempts >= 1 &&
    attempts <= 20 &&
    allowedIds.length > 0 &&
    allowedIds.length * attempts <= 200;
  const chooseSuite = (id: string, application = target) => {
    setSuiteId(id);
    setCaseIds(
      application?.manifest?.suites
        .find((s) => s.id === id)
        ?.cases.map((c) => c.id) ?? [],
    );
  };
  return (
    <DetailInspectorDrawer
      open={Boolean(selection)}
      onClose={onClose}
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
          <label htmlFor="eval-application" className="text-xs font-medium">
            Application
          </label>
          <Select
            value={targetId}
            disabled={working}
            onValueChange={(id) => {
              const next = targets.targets.find((t) => t.id === id);
              setTargetId(id);
              chooseSuite(next?.manifest?.suites[0]?.id ?? "", next);
            }}
          >
            <SelectTrigger id="eval-application" className="w-full">
              <SelectValue placeholder="Select an application" />
            </SelectTrigger>
            <SelectContent>
              {targets.targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} · {t.environment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {target?.error ? (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            {target.error}
          </p>
        ) : null}
        <div className="space-y-2">
          <label htmlFor="eval-suite" className="text-xs font-medium">
            Suite
          </label>
          <Select
            value={suiteId}
            disabled={working}
            onValueChange={(id) => chooseSuite(id)}
          >
            <SelectTrigger id="eval-suite" className="w-full">
              <SelectValue placeholder="Select a suite" />
            </SelectTrigger>
            <SelectContent>
              {target?.manifest?.suites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name ?? displayName(s.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                onChange={(event) =>
                  setCaseIds((current) =>
                    event.target.checked
                      ? [...current, c.id]
                      : current.filter((id) => id !== c.id),
                  )
                }
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
            value={repetitions}
            disabled={working}
            onChange={(e) => setRepetitions(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Each attempt runs in an independent session. Between 1 and 20
            attempts, up to 200 total.
          </p>
        </div>
        {suite ? (
          <details>
            <summary className="text-xs text-muted-foreground">
              Review conversation definitions
            </summary>
            <div className="mt-3">
              <PayloadViewer value={suite} defaultClean={false} />
            </div>
          </details>
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
            if (suite) void onRun(targetId, suite, allowedIds, attempts);
          }}
        >
          <Play />
          {working ? "Starting…" : "Run suite"}
        </Button>
      </div>
    </DetailInspectorDrawer>
  );
}
