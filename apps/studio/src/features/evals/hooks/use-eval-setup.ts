"use client";
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
  launchJudge: parseAsStringLiteral(["studio", "app"]).withDefault("studio"),
  launchApplication: parseAsString.withDefault(""),
  launchSuite: parseAsString.withDefault(""),
  launchScope: parseAsStringLiteral(["all", "selected"]).withDefault("all"),
  launchSuites: parseAsJson(z.array(z.string())),
  launchConcurrency: parseAsString.withDefault("1"),
  launchCases: parseAsJson(z.array(z.string())),
  launchAttempts: parseAsString.withDefault("1"),
};
export function useEvalSetup(targets: EvalTargets) {
  const [query, setQuery] = useStudioQueryStates(evalSetupParsers, {
    shallow: true,
  });
  const target = targets.targets.find((t) => t.id === query.launchApplication);
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
    open: (targetId?: string, suiteId?: string) => {
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
        launchAttempts: "1",

        launchJudge: null,
      });
    },
    close: () => {
      void setQuery({
        launch: null,
        launchApplication: null,
        launchSuite: null,
        launchScope: null,
        launchSuites: null,
        launchConcurrency: null,
        launchCases: null,
        launchAttempts: null,

        launchJudge: null,
      });
    },
  };
}
