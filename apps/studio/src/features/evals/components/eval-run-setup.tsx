"use client";
import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptLibrary,
  PromptLibrarySchema,
  type PromptSelection,
} from "@kortyx/telemetry-contracts";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
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
  const searchParams = useSearchParams();
  const targetId = query.launchApplication;
  const suiteId = query.launchSuite;
  const attempts = Number(query.launchAttempts);
  const allowedIds = (
    query.launchCases ??
    suite?.cases.map((c) => c.id) ??
    []
  ).filter((id) => suite?.cases.some((c) => c.id === id));
  const appJudge = target?.manifest?.judge;
  const studioSupported = Boolean(target?.manifest?.studioJudging);
  const judgeAvailable =
    query.launchJudge === "studio"
      ? studioSupported && Boolean(targets.studioJudge)
      : Boolean(appJudge);
  const judgeHelp =
    query.launchJudge === "app"
      ? appJudge
        ? `${appJudge.id} · ${appJudge.version}`
        : "This application has no code judge configured."
      : !targets.studioJudge
        ? "Studio judge is not configured. Configure a model on the Studio backend, or choose an available App judge."
        : !studioSupported
          ? "Update the application’s SDK to support Studio judging, or choose App judge."
          : `${targets.studioJudge.id} · ${targets.studioJudge.version}`;
  const onRun = async () => {
    if (!suite || !target || !judgeAvailable) return;
    setWorking(true);
    setError("");
    try {
      const run = await evalRequest("runs", {
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
                    : { type: "production" },
            }
          : {}),
        targetId,
        judge: query.launchJudge,
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
    (query.launchPrompts === "production" ||
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
            ))))) &&
    Number.isInteger(attempts) &&
    attempts >= 1 &&
    attempts <= 20 &&
    allowedIds.length > 0 &&
    allowedIds.length * attempts <= 100;
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
                { value: "production", label: "Production prompts" },
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
                disabled: !targets.studioJudge || !studioSupported,
              },
              { value: "app", label: "App judge", disabled: !appJudge },
            ]}
            onChange={(value) => {
              if (value === "studio" || value === "app")
                void setQuery({ launchJudge: value });
            }}
          />
          <p className="break-words text-xs text-muted-foreground">
            {judgeHelp}
          </p>
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
            attempts, up to 100 total.
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
            !judgeAvailable ||
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
