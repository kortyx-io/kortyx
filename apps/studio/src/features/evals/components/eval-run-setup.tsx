"use client";

import { type EvalSettings, EvalSettingsSchema } from "@kortyx/agent/evals";
import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptLibrary,
  PromptLibrarySchema,
  type PromptSelection,
} from "@kortyx/telemetry-contracts";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DetailInspectorDrawer } from "@/components/detail/detail-inspector";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { promptRequest } from "@/features/prompts/api/client";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import { evalRequest } from "../api/client";
import { useEvalSetup } from "../hooks/use-eval-setup";
import { evalNavigationHref } from "../lib/navigation";
import type { EvalTargets } from "../schema";
import { EvalDropdown } from "./eval-dropdown";
import { EvalSettingsFields } from "./eval-settings-fields";
import { EvalSuiteSelection } from "./eval-suite-selection";

export function EvalRunSetup({
  targets,
  matchPath,
  onStarted,
}: {
  targets: EvalTargets;
  matchPath: string;
  onStarted?: () => void | Promise<void>;
}) {
  const {
    query,
    resolved,
    overrides,
    settingsError,
    setQuery,
    target,
    suite,
    judge,
    studioAvailable,
    appJudge,
    appJudgeDescription,
    close,
  } = useEvalSetup(targets);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const launch = useRef<{ body: string; key: string } | null>(null);
  const [prompts, setPrompts] = useState<PromptLibrary | null>(null),
    [promptDetail, setPromptDetail] = useState<PromptDetail | null>(null),
    [promptSearch, setPromptSearch] = useState("");
  useEffect(() => {
    if (!query.launch || !target?.manifest?.promptContracts?.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void promptRequest(
        `library?${new URLSearchParams({ search: promptSearch })}`,
        undefined,
        controller.signal,
      )
        .then((value) => setPrompts(PromptLibrarySchema.parse(value)))
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Prompt library unavailable.",
            );
        });
    }, 150);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query.launch, target?.manifest?.promptContracts?.length, promptSearch]);
  useEffect(() => {
    setPromptDetail(null);
    if (query.launchPrompts !== "single" || !query.launchPrompt) return;
    const controller = new AbortController();
    void promptRequest(
      `assets/${query.launchPrompt}${query.launchVersion ? `?version=${query.launchVersion}` : ""}`,
      undefined,
      controller.signal,
    )
      .then((value) => setPromptDetail(PromptDetailSchema.parse(value)))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(String(cause));
      });
    return () => controller.abort();
  }, [query.launchPrompts, query.launchPrompt, query.launchVersion]);
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
  const attempts = overrides.repetitions ?? resolved.values.repetitions;
  const concurrency = overrides.concurrency ?? resolved.values.concurrency;
  const limits = target?.manifest?.execution?.limits;
  const caseTimeoutMs =
    overrides.caseTimeoutMs ?? resolved.values.caseTimeoutMs;
  const runTimeoutMs = overrides.runTimeoutMs ?? resolved.values.runTimeoutMs;
  const count = selected.reduce((sum, item) => sum + casesFor(item).length, 0);
  const total = count * attempts;
  const judgeAvailable =
    judge === "app" ? Boolean(appJudge) : judge === "studio" && studioAvailable;
  const studioUnavailableReason = !targets.studioJudge
    ? "No Studio judge is configured on this backend."
    : !target?.manifest?.studioJudging
      ? "This application's SDK does not support Studio judging."
      : undefined;
  const promptValid =
    query.launchPrompts === "live" ||
    (Boolean(target?.manifest?.promptContracts?.length) &&
      ((query.launchPrompts === "single" &&
        Boolean(query.launchPrompt) &&
        Number.isInteger(Number(query.launchVersion)) &&
        Number(query.launchVersion) > 0 &&
        Boolean(
          promptDetail?.versions.some(
            (version) => version.version === Number(query.launchVersion),
          ),
        ) &&
        Boolean(
          target?.manifest?.promptContracts?.some(
            (contract) => contract.id === promptDetail?.asset.key,
          ),
        )) ||
        (query.launchPrompts === "group" &&
          Boolean(
            prompts?.groups.some(
              (group) =>
                group.id === query.launchGroup &&
                group.members.length &&
                group.members.every(
                  (member) =>
                    !member.archived &&
                    target?.manifest?.promptContracts?.some(
                      (contract) =>
                        contract.id ===
                        (member.key ??
                          prompts.assets.find(
                            (asset) => asset.id === member.promptId,
                          )?.key),
                    ),
                ),
            ),
          ))));
  const valid =
    !settingsError &&
    EvalSettingsSchema.safeParse(overrides).success &&
    (limits?.concurrency === undefined || concurrency <= limits.concurrency) &&
    (limits?.caseTimeoutMs === undefined ||
      caseTimeoutMs <= limits.caseTimeoutMs) &&
    (targets.settings?.maxRunTimeoutMs === undefined ||
      runTimeoutMs <= targets.settings.maxRunTimeoutMs) &&
    promptValid &&
    selected.length > 0 &&
    Number.isInteger(attempts) &&
    attempts >= 1 &&
    attempts <= 20 &&
    Number.isInteger(concurrency) &&
    concurrency >= 1 &&
    concurrency <= 20 &&
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
      ...overrides,
      ...(!targets.settings?.defaults.judge &&
      judge === "app" &&
      !studioAvailable
        ? { judge: "app" }
        : {}),
      metadata: { source: "manual" },
      ...(target.manifest?.promptContracts?.length
        ? {
            promptSelection:
              query.launchPrompts === "single"
                ? {
                    type: "single",
                    id: query.launchPrompt,
                    version: Number(query.launchVersion),
                  }
                : query.launchPrompts === "group"
                  ? { type: "group", groupId: query.launchGroup }
                  : { type: "live" },
          }
        : {}),
    };
    const serialized = JSON.stringify(body);
    if (launch.current?.body !== serialized)
      launch.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const run = await evalRequest("evaluations", {
        ...body,
        idempotencyKey: launch.current.key,
      });
      if (onStarted) {
        launch.current = null;
        await close();
        await onStarted();
      } else {
        router.push(evalNavigationHref(`/evals/evaluations/${run.id}`, search));
      }
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
      <div className="min-h-0 flex-1 space-y-5 overflow-auto overscroll-contain p-5 [scrollbar-width:thin]">
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium">Application · Environment</p>
            <HelpCircle help={studioHelp.evals} />
          </div>
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
                launchPrompts: null,
                launchPrompt: null,
                launchVersion: null,
                launchGroup: null,
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
        {query.launchRerun ? (
          <p className="text-sm text-muted-foreground">
            Failed and errored cases are selected once each. This creates a new
            run using current deployed suite definitions and the prompt source
            selected below (Live prompts by default). It does not replay the
            original application or data state. Review the cases, judge and
            execution settings before launching; tools will execute again.
          </p>
        ) : null}
        {target?.manifest?.promptContracts?.length ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium">Prompt versions</p>
                <HelpCircle help={studioHelp.prompts} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Freeze live prompt versions for {target.name}, with optional
                candidate overrides.
              </p>
            </div>
            <EvalDropdown
              label="Prompt source"
              className="w-full"
              value={query.launchPrompts}
              options={[
                { value: "live", label: "Live prompts" },
                { value: "single", label: "Single prompt version" },
                { value: "group", label: "Test group" },
              ]}
              disabled={working}
              onChange={(value) =>
                void setQuery({
                  launchPrompts: value as PromptSelection["type"],
                })
              }
            />
            {query.launchPrompts === "single" && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Only prompts registered by {target.name} are shown. To test
                  another prompt, choose an application that uses it above.
                </p>
                <EvalDropdown
                  label="Prompt"
                  search={{
                    label: "Search registered prompts",
                    placeholder: "Search prompt names or keys…",
                    value: promptSearch,
                    onChange: setPromptSearch,
                  }}
                  triggerLabel={promptDetail?.asset.name}
                  className="w-full"
                  value={query.launchPrompt}
                  disabled={working}
                  options={(prompts?.assets ?? [])
                    .filter((asset) =>
                      target.manifest?.promptContracts?.some(
                        (contract) => contract.id === asset.key,
                      ),
                    )
                    .map((asset) => ({ value: asset.id, label: asset.name }))}
                  onChange={(id) =>
                    void setQuery({
                      launchPrompt: id,
                      launchVersion: String(
                        prompts?.assets.find((asset) => asset.id === id)
                          ?.latestVersion ?? "",
                      ),
                    })
                  }
                />
                <EvalDropdown
                  label="Prompt version"
                  className="w-full"
                  disabled={working || !promptDetail}
                  value={query.launchVersion}
                  options={(promptDetail?.versions ?? []).map((version) => ({
                    value: String(version.version),
                    label: `v${version.version}${version.note ? ` · ${version.note}` : ""}`,
                  }))}
                  onChange={(version) =>
                    void setQuery({ launchVersion: version })
                  }
                />
                {promptDetail?.versionsNextCursor && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={async () => {
                      try {
                        const next = PromptDetailSchema.parse(
                          await promptRequest(
                            `assets/${query.launchPrompt}?versionsCursor=${promptDetail.versionsNextCursor}`,
                          ),
                        );
                        setPromptDetail({
                          ...next,
                          versions: [
                            ...promptDetail.versions,
                            ...next.versions.filter(
                              (version) =>
                                !promptDetail.versions.some(
                                  (item) => item.version === version.version,
                                ),
                            ),
                          ],
                        });
                      } catch (cause) {
                        setError(String(cause));
                      }
                    }}
                  >
                    Load older versions
                  </Button>
                )}
              </>
            )}
            {query.launchPrompts === "group" && (
              <>
                <EvalDropdown
                  label="Test group"
                  className="w-full"
                  value={query.launchGroup}
                  disabled={working}
                  options={(prompts?.groups ?? []).map((group) => ({
                    value: group.id,
                    label: `${group.name} · ${group.members.length} prompts`,
                    disabled:
                      !group.members.length ||
                      group.members.some(
                        (member) =>
                          member.archived ||
                          !target.manifest?.promptContracts?.some(
                            (contract) =>
                              contract.id ===
                              (member.key ??
                                prompts?.assets.find(
                                  (asset) => asset.id === member.promptId,
                                )?.key),
                          ),
                      ),
                  }))}
                  onChange={(groupId) =>
                    void setQuery({ launchGroup: groupId })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Groups select candidate versions for this launch. The suite
                  remains independent.
                </p>
              </>
            )}
          </div>
        ) : null}
        {error || settingsError || target?.error ? (
          <p
            role="alert"
            className="rounded-md border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400"
          >
            {error || settingsError || target?.error}
          </p>
        ) : null}
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
          <EvalSettingsFields
            fields={["repetitions"]}
            resolved={resolved}
            overrides={overrides}
            disabled={working}
            onChange={(_, value) =>
              void setQuery({
                launchAttempts: value === undefined ? null : String(value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Every conversation runs this many times, including passed cases.
            Each repetition uses an independent session.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium">Judge</p>
            <HelpCircle help={studioHelp.evalJudge} />
          </div>
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
                  ? "No App judge configured for one or more selected suites."
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
                ? appJudgeDescription
                : "No App judge configured for one or more selected suites."
              : judge === "studio"
                ? studioAvailable
                  ? `${targets.studioJudge?.id} · ${targets.studioJudge?.version}`
                  : studioUnavailableReason
                : "No judge is available for this application environment."}
          </p>
        </div>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Execution settings
          </summary>
          <div className="mt-4 space-y-3">
            <EvalSettingsFields
              fields={[
                "concurrency",
                "caseTimeoutMs",
                "gradingTimeoutMs",
                "runTimeoutMs",
              ]}
              resolved={resolved}
              overrides={overrides}
              disabled={working}
              supportsGradingTimeout={
                judge === "studio" ||
                Boolean(
                  target?.manifest?.execution?.overrides.includes(
                    "gradingTimeoutMs",
                  ),
                )
              }
              supportsCaseTimeout={Boolean(
                target?.manifest?.execution?.overrides.includes(
                  "caseTimeoutMs",
                ),
              )}
              limits={{
                ...limits,
                runTimeoutMs: targets.settings?.maxRunTimeoutMs,
              }}
              onChange={(key, value) => {
                const queryKey = {
                  repetitions: "launchAttempts",
                  concurrency: "launchConcurrency",
                  caseTimeoutMs: "launchCaseTimeout",
                  gradingTimeoutMs: "launchGradingTimeout",
                  runTimeoutMs: "launchRunTimeout",
                }[key as Exclude<keyof EvalSettings, "judge">];
                void setQuery({
                  [queryKey]: value === undefined ? null : String(value),
                });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Evaluation deadline: {runTimeoutMs / 60_000} minutes from
              execution start, including grading. Queue time is excluded.
            </p>
            {query.launchJudge && (
              <Button
                size="inline"
                variant="link"
                disabled={working}
                onClick={() => void setQuery({ launchJudge: null })}
              >
                Reset judge to default
              </Button>
            )}
          </div>
        </details>
        <p className="text-xs text-muted-foreground">
          Up to 100 conversation executions per suite and 1,000 per evaluation,
          including all repetitions.
        </p>
        {!valid && selected.length > 0 ? (
          <output className="block text-xs text-muted-foreground">
            {!promptValid
              ? "Choose a compatible prompt version or test group."
              : "Select at least one conversation and stay within the execution limits above."}
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
          {Number.isFinite(total) ? total : "—"} executions
        </p>
        <Button
          disabled={working || !targets.canRun || !valid || !judgeAvailable}
          onClick={() => void onRun()}
        >
          <Play />
          {working ? "Starting…" : "Run evaluations"}
        </Button>
      </div>
    </DetailInspectorDrawer>
  );
}
