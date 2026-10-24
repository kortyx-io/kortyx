"use client";
import { type EvalSettings, resolveEvalSettings } from "@kortyx/agent/evals";
import type { PromptSelection } from "@kortyx/telemetry-contracts";
import {
  parseAsBoolean,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { z } from "zod";
import { useStudioQueryStates } from "@/lib/nuqs";
import type { EvalTargets } from "../schema";
export const evalSetupParsers = {
  launch: parseAsBoolean.withDefault(false),
  launchRerun: parseAsBoolean.withDefault(false),
  launchJudge: parseAsStringLiteral(["studio", "app"]),
  launchApplication: parseAsString.withDefault(""),
  launchSuite: parseAsString.withDefault(""),
  launchScope: parseAsStringLiteral(["all", "selected"]).withDefault("all"),
  launchSuites: parseAsJson(z.array(z.string())),
  launchConcurrency: parseAsString,
  launchCaseTimeout: parseAsString,
  launchGradingTimeout: parseAsString,
  launchRunTimeout: parseAsString,
  launchCases: parseAsJson(z.array(z.string())),
  launchSuiteCases: parseAsJson(
    z.array(z.object({ suiteId: z.string(), caseIds: z.array(z.string()) })),
  ),
  launchExpandedSuites: parseAsJson(z.array(z.string())),
  launchAttempts: parseAsString,
  launchPrompts: parseAsStringLiteral(["live", "single", "group"]).withDefault(
    "live",
  ),
  launchPrompt: parseAsString.withDefault(""),
  launchVersion: parseAsString.withDefault(""),
  launchGroup: parseAsString.withDefault(""),
};
export function useEvalSetup(targets: EvalTargets) {
  const [query, setQuery] = useStudioQueryStates(evalSetupParsers, {
    shallow: true,
  });
  const target = targets.targets.find((t) => t.id === query.launchApplication);
  const studioAvailable = Boolean(
    target?.manifest?.studioJudging && targets.studioJudge,
  );
  const selectedIds =
    query.launchScope === "selected"
      ? (query.launchSuites ?? (query.launchSuite ? [query.launchSuite] : []))
      : undefined;
  const selectedDefinitions =
    target?.manifest?.suites.filter(
      (item) => !selectedIds || selectedIds.includes(item.id),
    ) ?? [];
  const appJudge =
    selectedDefinitions.length &&
    selectedDefinitions.every((item) => item.judge ?? target?.manifest?.judge)
      ? (selectedDefinitions[0]?.judge ?? target?.manifest?.judge)
      : undefined;
  const selectedJudges = selectedDefinitions.map((item) => ({
    suite: item.name ?? item.id,
    judge: item.judge ?? target?.manifest?.judge,
  }));
  const appJudgeDescription = selectedJudges
    .map(({ suite, judge }) =>
      judge
        ? `${selectedJudges.length > 1 ? `${suite}: ` : ""}${judge.id} · ${judge.version}`
        : `${suite}: no App judge configured`,
    )
    .join("; ");
  const judge =
    query.launchJudge ??
    targets.settings?.defaults.judge ??
    (studioAvailable ? "studio" : appJudge ? "app" : null);
  const overrides: EvalSettings = {
    ...(query.launchAttempts !== null
      ? { repetitions: Number(query.launchAttempts) }
      : {}),
    ...(query.launchConcurrency !== null
      ? { concurrency: Number(query.launchConcurrency) }
      : {}),
    ...(query.launchCaseTimeout !== null
      ? { caseTimeoutMs: Number(query.launchCaseTimeout) }
      : {}),
    ...(query.launchGradingTimeout !== null
      ? { gradingTimeoutMs: Number(query.launchGradingTimeout) }
      : {}),
    ...(query.launchRunTimeout !== null
      ? { runTimeoutMs: Number(query.launchRunTimeout) }
      : {}),
    ...(query.launchJudge ? { judge: query.launchJudge } : {}),
  };
  // Display the full baseline, even when a default exceeds this application's
  // ceiling. Validate the final run values so a lower override can repair it.
  const resolved = resolveEvalSettings(
    {},
    targets.settings?.defaults,
    {
      defaults: target?.manifest?.execution?.defaults ?? {},
      limits: {},
      overrides: [
        "repetitions",
        "concurrency",
        "caseTimeoutMs",
        "gradingTimeoutMs",
      ],
    },
    targets.settings?.installation,
  );
  let settingsError = "";
  try {
    resolveEvalSettings(
      { ...overrides, ...(judge ? { judge } : {}) },
      targets.settings?.defaults,
      target?.manifest?.execution,
      targets.settings?.installation,
      targets.settings?.maxRunTimeoutMs,
    );
  } catch (error) {
    settingsError =
      error instanceof Error ? error.message : "Invalid evaluation defaults.";
  }
  const selected =
    query.launchSuites ?? (query.launchSuite ? [query.launchSuite] : []);
  const suite =
    query.launchScope === "selected" && selected.length === 1
      ? target?.manifest?.suites.find((s) => s.id === selected[0])
      : undefined;
  return {
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
    open: (
      targetId?: string,
      suiteId?: string,
      selection?: PromptSelection,
    ) => {
      const target =
        targets.targets.find((t) => t.id === targetId) ??
        targets.targets.find((t) => t.manifest?.suites.length) ??
        targets.targets[0];
      const suite =
        target?.manifest?.suites.find((s) => s.id === suiteId) ??
        target?.manifest?.suites[0];
      void setQuery({
        launch: true,
        launchRerun: null,
        launchApplication: target?.id ?? "",
        launchSuite: suiteId ? (suite?.id ?? "") : "",
        launchScope: suiteId ? "selected" : "all",
        launchSuites: suiteId && suite ? [suite.id] : null,
        launchConcurrency: null,
        launchCaseTimeout: null,
        launchGradingTimeout: null,
        launchRunTimeout: null,
        launchCases: null,
        launchSuiteCases: null,
        launchExpandedSuites: suiteId && suite ? [suite.id] : null,
        launchAttempts: null,

        launchJudge: null,
        launchPrompts: selection?.type ?? null,
        launchPrompt: selection?.type === "single" ? selection.id : null,
        launchVersion:
          selection?.type === "single" ? String(selection.version) : null,
        launchGroup: selection?.type === "group" ? selection.groupId : null,
      });
    },
    close: () => {
      return setQuery({
        launch: null,
        launchRerun: null,
        launchApplication: null,
        launchSuite: null,
        launchScope: null,
        launchSuites: null,
        launchConcurrency: null,
        launchCaseTimeout: null,
        launchGradingTimeout: null,
        launchRunTimeout: null,
        launchCases: null,
        launchSuiteCases: null,
        launchExpandedSuites: null,
        launchAttempts: null,

        launchJudge: null,
        launchPrompts: null,
        launchPrompt: null,
        launchVersion: null,
        launchGroup: null,
      });
    },
  };
}
