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
  evaluationCompareHref,
  legacyEvalDetailHref,
  legacyEvalHref,
  parseDatasetId,
} from "./navigation";

describe("eval navigation", () => {
  it("defaults to history and keeps legacy suite links usable", () => {
    expect(legacyEvalHref({})).toBe("/experiments");
    expect(legacyEvalHref({ view: "suites", application: "app" })).toBe(
      "/datasets?application=app",
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
      "/experiments/runs/candidate/compare?case=job%3A1&change=improved&baseline=baseline",
    );
  });
  it("redirects legacy case inspections to their own browsable route", () => {
    expect(legacyEvalHref({ run: "candidate", case: "job:2" })).toBe(
      "/experiments/cases/candidate/job/2?case=job%3A2",
    );
  });
  it("encodes entity identities as individual route segments", () => {
    expect(evalComparisonCaseHref("a/b", "case/a", "b/c")).toBe(
      "/experiments/cases/a%2Fb/case%2Fa/compare?baseline=b%2Fc",
    );
    expect(evalCaseHref("run", "case/a", 2)).toBe(
      "/experiments/cases/run/case%2Fa/2",
    );
    expect(evalRunHref("a/b")).toBe("/experiments/runs/a%2Fb");
    expect(evalSuiteHref("tenant/a", "suite/b")).toBe(
      "/datasets/%5B%22tenant%2Fa%22%2C%22suite%2Fb%22%5D",
    );
    expect(evalCompareHref("a", "b/c")).toBe(
      "/experiments/runs/a/compare?baseline=b%2Fc",
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
      "/experiments/cases/candidate/case%2Fa/compare?baseline=base&change=incomplete&candidateAttempt=1",
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
    expect(url.pathname).toBe("/experiments/runs/next/compare");
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

it("encodes evaluation comparison scope with or without a baseline", () => {
  expect(evaluationCompareHref("a/b", undefined, "suite/x")).toBe(
    "/experiments/a%2Fb/compare?suiteId=suite%2Fx",
  );
  expect(evaluationCompareHref("a", "b/c", "suite/x")).toBe(
    "/experiments/a/compare?baseline=b%2Fc&suiteId=suite%2Fx",
  );
});

it("preserves target identity, encoded dataset IDs, and repeated query selections", () => {
  const identity: [string, string] = ["target/a", "case%2F:suite"];
  const href = evalSuiteHref(...identity);
  expect(parseDatasetId(href.slice("/datasets/".length))).toEqual(identity);
  expect(evalSuiteHref("target", "a:case%2F:suite")).not.toBe(href);
  expect(
    legacyEvalDetailHref(["suites", ...identity], {
      env: "staging",
      suiteCase: "case/1",
      selected: ["a", "b"],
    }),
  ).toBe(`${href}?env=staging&suiteCase=case%2F1&selected=a&selected=b`);
  expect(parseDatasetId("malformed")).toBeNull();
  expect(
    legacyEvalDetailHref(["evaluations", "experiment", "compare"], {
      baseline: "baseline",
    }),
  ).toBe("/experiments/experiment/compare?baseline=baseline");
});
