/** Shared tab identities: adding a tab also requires authored page-help copy. */
export const DETAIL_TAB_IDS = {
  run: [
    "calls",
    "overview",
    "trace",
    "topology",
    "model-io",
    "summary",
    "feedback",
    "events",
  ],
  session: ["activity", "runs", "state", "metadata"],
  interrupt: ["decision", "timeline", "payload"],
  prompt: ["content", "evals", "runs", "reviews", "activity"],
  "eval-run": ["cases", "context", "definition"],
  "eval-case-comparison": ["both", "candidate", "baseline"],
  diagnostic: ["exception", "capture", "context"],
} as const;
export type DetailTabFamily = keyof typeof DETAIL_TAB_IDS;
export type DetailTabId<F extends DetailTabFamily> =
  (typeof DETAIL_TAB_IDS)[F][number];
export type DetailTabCopy = {
  [F in DetailTabFamily]: Record<DetailTabId<F>, string>;
};
