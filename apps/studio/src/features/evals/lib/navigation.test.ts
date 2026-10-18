import { describe, expect, it } from "vitest";
import { evalSetupParsers } from "../hooks/use-eval-setup";
import {
  comparisonSelectionHref,
  evalCaseHref,
  evalCompareHref,
  evalComparisonCaseHref,
  evalNavigationHref,
  evalRunHref,
  evalSuiteHref,
  legacyEvalHref,
} from "./navigation";

describe("eval navigation", () => {
  it("defaults to history and keeps legacy suite links usable", () => {
    expect(legacyEvalHref({})).toBe("/evals/runs");
    expect(legacyEvalHref({ view: "suites", application: "app" })).toBe(
      "/evals/suites?application=app",
    );
  });
  it("redirects saved legacy comparison links without losing inspection state", () => {
    expect(
      legacyEvalHref({
        run: "candidate",
        compare: "baseline",
        case: "job:1",
        change: "improved",
      }),
    ).toBe(
      "/evals/runs/candidate/compare?case=job%3A1&change=improved&baseline=baseline",
    );
  });
  it("redirects legacy case inspections to their own browsable route", () => {
    expect(legacyEvalHref({ run: "candidate", case: "job:2" })).toBe(
      "/evals/cases/candidate/job/2?case=job%3A2",
    );
  });
  it("encodes entity identities as individual route segments", () => {
    expect(evalComparisonCaseHref("a/b", "case/a", "b/c")).toBe(
      "/evals/cases/a%2Fb/case%2Fa/compare?baseline=b%2Fc",
    );
    expect(evalCaseHref("run", "case/a", 2)).toBe(
      "/evals/cases/run/case%2Fa/2",
    );
    expect(evalRunHref("a/b")).toBe("/evals/runs/a%2Fb");
    expect(evalSuiteHref("tenant/a", "suite/b")).toBe(
      "/evals/suites/tenant%2Fa/suite%2Fb",
    );
    expect(evalCompareHref("a", "b/c")).toBe(
      "/evals/runs/a/compare?baseline=b%2Fc",
    );
  });
  it("upgrades inline comparison selections while retaining baseline and filters", () => {
    expect(
      comparisonSelectionHref("candidate", {
        baseline: "base",
        case: "case/a",
        change: "incomplete",
        candidateAttempt: "1",
      }),
    ).toBe(
      "/evals/cases/candidate/case%2Fa/compare?baseline=base&change=incomplete&candidateAttempt=1",
    );
    expect(
      comparisonSelectionHref("candidate", { baseline: "base" }),
    ).toBeNull();
    expect(comparisonSelectionHref("candidate", { case: "job" })).toBeNull();
  });
  it("carries list filters while dropping stale detail and launch state", () => {
    const href = evalNavigationHref(
      evalCompareHref("next", "new-baseline"),
      new URLSearchParams(
        "q=jobs&application=app&status=failed&sort=status&dir=asc&cursor=20&pageSize=10&case=old&baseline=old&launch=true&selected=a,b&payload.answer.mode=json",
      ),
    );
    const url = new URL(href, "http://studio");
    expect(url.pathname).toBe("/evals/runs/next/compare");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "jobs",
      application: "app",
      status: "failed",
      sort: "status",
      dir: "asc",
      cursor: "20",
      pageSize: "10",
      baseline: "new-baseline",
    });
  });
  it("distinguishes default case selection from an explicitly empty selection", () => {
    expect(evalSetupParsers.launchCases.parse("[]")).toEqual([]);
    expect(evalSetupParsers.launchCases.parse('["case-a","case-b"]')).toEqual([
      "case-a",
      "case-b",
    ]);
    expect(evalSetupParsers.launchCases.serialize([])).toBe("[]");
  });
});

it("round-trips opaque launch case IDs without interpreting commas or percent escapes", () => {
  const cases = [
    "role,city=Paris",
    "role%3A%25",
    "role/path?city=Paris#choice",
    "rôle café + Paris",
  ];
  const serialized = evalSetupParsers.launchCases.serialize(cases);
  expect(serialized).not.toBe("");
  expect(
    evalSetupParsers.launchCases.parse(
      new URLSearchParams({ launchCases: serialized }).get("launchCases")!,
    ),
  ).toEqual(cases);
  expect(evalSetupParsers.launchCases.serialize([])).toBe("[]");
});
it.each([
  "null",
  "{}",
  '["valid",1]',
  '"role"',
  "not-json",
])("rejects malformed launch case selection %s", (value) => {
  expect(evalSetupParsers.launchCases.parse(value)).toBeNull();
});
