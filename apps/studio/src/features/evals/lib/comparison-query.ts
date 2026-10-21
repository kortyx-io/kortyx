import {
  createParser,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";
import type {
  ConversationChange,
  EvaluationChanges,
} from "./evaluation-changes";

const repetition = createParser({
  parse: (value) =>
    /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : null,
  serialize: String,
});
export const comparisonQueryParsers = {
  "expand.change-more-stats": parseAsBoolean,
  "expand.change-Earlier-all-repetitions": parseAsBoolean,
  "expand.change-This run-all-repetitions": parseAsBoolean,
  changeStep: createParser({
    parse: (value) =>
      /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value))
        ? Number(value)
        : null,
    serialize: String,
  }),
  changeRun: parseAsString,
  changeCase: parseAsString,
  changeBaseline: parseAsString,
  changeGroup: parseAsStringLiteral([
    "all",
    "regressed",
    "improved",
    "still-failing",
    "review",
    "unchanged",
  ] as const),
  earlierRepetition: repetition,
  currentRepetition: repetition,
};
export const closedComparisonQuery = {
  "expand.change-more-stats": null,
  "expand.change-Earlier-all-repetitions": null,
  "expand.change-This run-all-repetitions": null,
  changeStep: null,
  changeRun: null,
  changeCase: null,
  changeBaseline: null,
  changeGroup: null,
  earlierRepetition: null,
  currentRepetition: null,
};
export function openComparisonQuery(
  comparison: EvaluationChanges,
  rows: ConversationChange[],
  grouped = false,
) {
  return {
    ...closedComparisonQuery,
    changeRun: comparison.candidate.id,
    changeCase: rows[0]?.key ?? null,
    changeBaseline: comparison.earlier?.id ?? null,
    changeGroup:
      grouped && rows.length !== comparison.rows.length
        ? (rows[0]?.kind ?? null)
        : null,
  };
}

export function closeComparisonQuery(search: Pick<URLSearchParams, "keys">) {
  return {
    ...Object.fromEntries(
      [...search.keys()]
        .filter((key) => key.startsWith("expand.change-"))
        .map((key) => [key, null]),
    ),
    ...closedComparisonQuery,
  };
}
