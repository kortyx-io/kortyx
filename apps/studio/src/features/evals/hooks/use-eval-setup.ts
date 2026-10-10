"use client";
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
  launchJudge: parseAsStringLiteral(["studio", "app"]),
  launchApplication: parseAsString.withDefault(""),
  launchSuite: parseAsString.withDefault(""),
  launchScope: parseAsStringLiteral(["all", "selected"]).withDefault("all"),
  launchSuites: parseAsJson(z.array(z.string())),
  launchConcurrency: parseAsString.withDefault("1"),
  launchCases: parseAsJson(z.array(z.string())),
  launchSuiteCases: parseAsJson(
    z.array(z.object({ suiteId: z.string(), caseIds: z.array(z.string()) })),
  ),
  launchExpandedSuites: parseAsJson(z.array(z.string())),
  launchAttempts: parseAsString.withDefault("1"),
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
  const appJudge = target?.manifest?.judge;
  const judge =
    query.launchJudge ?? (studioAvailable ? "studio" : appJudge ? "app" : null);
  const selected =
    query.launchSuites ?? (query.launchSuite ? [query.launchSuite] : []);
  const suite =
    query.launchScope === "selected" && selected.length === 1
      ? target?.manifest?.suites.find((s) => s.id === selected[0])
      : undefined;
  return {
    query,
    setQuery,
    target,
    suite,
    judge,
    studioAvailable,
    appJudge,
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
        launchApplication: target?.id ?? "",
        launchSuite: suiteId ? (suite?.id ?? "") : "",
        launchScope: suiteId ? "selected" : "all",
        launchSuites: suiteId && suite ? [suite.id] : null,
        launchConcurrency: "1",
        launchCases: null,
        launchSuiteCases: null,
        launchExpandedSuites: suiteId && suite ? [suite.id] : null,
        launchAttempts: "1",

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
        launchApplication: null,
        launchSuite: null,
        launchScope: null,
        launchSuites: null,
        launchConcurrency: null,
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
