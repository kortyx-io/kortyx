"use client";
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
import { Input } from "@/components/ui/input";
import { promptRequest } from "@/features/prompts/api/client";
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
      judge,
      repetitions: attempts,
      concurrency,
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
        {target?.manifest?.promptContracts?.length ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Prompt versions</p>
              <p className="text-[11px] text-muted-foreground">
                Freeze the assigned prompts in {target.environment}, with
                optional candidate overrides.
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
                <Input
                  aria-label="Search registered prompts"
                  placeholder="Search prompt names or keys…"
                  value={promptSearch}
                  onChange={(event) => setPromptSearch(event.target.value)}
                />
                <EvalDropdown
                  label="Prompt"
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
                    label: `v${version.version} · ${version.note}`,
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
              Concurrent attempts across suites
            </label>
            <Input
              id="eval-concurrency"
              type="number"
              min={1}
              max={20}
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
            {!promptValid
              ? "Choose a compatible prompt version or test group."
              : "Select at least one conversation and use the attempt limits above."}
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
