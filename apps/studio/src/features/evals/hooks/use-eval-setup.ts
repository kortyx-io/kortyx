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
  launchCases: parseAsJson(z.array(z.string())),
  launchAttempts: parseAsString.withDefault("1"),
  launchDefinition: parseAsBoolean.withDefault(false),
};
export function useEvalSetup(targets: EvalTargets) {
  const [query, setQuery] = useStudioQueryStates(evalSetupParsers, {
    shallow: true,
    urlKeys: { launchDefinition: "expand.launch-definition" },
  });
  const target = targets.targets.find((t) => t.id === query.launchApplication);
  const suite = target?.manifest?.suites.find(
    (s) => s.id === query.launchSuite,
  );
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
        launchSuite: suite?.id ?? "",
        launchCases: null,
        launchAttempts: "1",
        launchDefinition: null,
        launchJudge: null,
      });
    },
    close: () => {
      void setQuery({
        launch: null,
        launchApplication: null,
        launchSuite: null,
        launchCases: null,
        launchAttempts: null,
        launchDefinition: null,
        launchJudge: null,
      });
    },
  };
}
