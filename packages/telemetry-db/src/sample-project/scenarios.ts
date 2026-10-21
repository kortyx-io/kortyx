import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";

/** Authored fiction. No captured transcripts, business rules, or source identifiers. */
export type SampleBehavior =
  | "answer"
  | "timeout"
  | "invalid-response"
  | "limit"
  | "cancelled"
  | "incomplete"
  | "running"
  | "pending-approval"
  | "pending-choice"
  | "expired"
  | "approved"
  | "declined"
  | "resume-failed"
  | "retry"
  | "denied";

export type SampleTurn = {
  id: string;
  input: string;
  output: string;
  behavior: SampleBehavior;
  specialists: Array<"research" | "resolution">;
};
export type SampleConversation = {
  id: string;
  snapshot: "baseline" | "candidate" | "latest";
  suite: "quality" | "resolutions" | "recovery";
  caseId: string;
  repetition?: number;
  failedStep?: number;
  verdict: "passed" | "failed" | "error";
  reason: string;
  turns: SampleTurn[];
};
const turn = (
  id: string,
  input: string,
  output: string,
  behavior: SampleBehavior = "answer",
  specialists: SampleTurn["specialists"] = ["research"],
): SampleTurn => ({ id, input, output, behavior, specialists });

const baseConversations: SampleConversation[] = [
  {
    id: sample.sessions.baseline,
    snapshot: "baseline",
    suite: "quality",
    caseId: sample.caseId,
    verdict: "failed",
    reason: "The answer omits the shipment state and delivery estimate.",
    turns: [
      turn(
        sample.runs.baseline,
        "Where is order SAMPLE-42?",
        "I cannot tell you when the order arrives.",
      ),
      turn(
        "sample-baseline-signature",
        "Will it need a signature?",
        "No signature is required, according to the delivery note.",
      ),
    ],
  },
  {
    id: "sample-session-baseline-tracking",
    snapshot: "baseline",
    suite: "quality",
    caseId: "delivery-confidence",
    verdict: "passed",
    reason: "Separates the carrier estimate from a confirmed appointment.",
    turns: [
      turn(
        "sample-baseline-tracking",
        "Check the shipment for SAMPLE-57.",
        "The parcel left the sorting center. The carrier estimates Friday.",
      ),
      turn(
        "sample-baseline-estimate",
        "Is that a confirmed delivery time?",
        "Friday is an estimate, not a confirmed appointment.",
      ),
    ],
  },
  {
    id: "sample-session-baseline-note",
    snapshot: "baseline",
    suite: "quality",
    caseId: "delivery-note",
    verdict: "passed",
    reason:
      "Checks the delivery note and answers both questions from evidence.",
    turns: [
      turn(
        "sample-baseline-note",
        "Does SAMPLE-64 need a signature?",
        "Yes. The delivery note requires a signature.",
      ),
      turn(
        "sample-baseline-note-location",
        "Where can I find the delivery note?",
        "Open the delivery section of SAMPLE-64 to see the note.",
      ),
      turn(
        "sample-baseline-note-summary",
        "Summarize that in one sentence.",
        "SAMPLE-64 requires a signature; its note is in the order's delivery section.",
      ),
    ],
  },
  {
    id: "sample-session-baseline-credit",
    snapshot: "baseline",
    suite: "resolutions",
    caseId: "credit-approval",
    verdict: "failed",
    reason: "Promises a credit before obtaining the required review.",
    turns: [
      turn(
        "sample-baseline-credit",
        "The lamp in SAMPLE-81 arrived cracked. Can I get a refund?",
        "Your $24 refund is already approved.",
        "answer",
        ["research", "resolution"],
      ),
      turn(
        "sample-baseline-credit-expired",
        "Please show me the review before doing anything.",
        "The review expired before a response was received.",
        "expired",
        ["resolution"],
      ),
      turn(
        "sample-baseline-credit-recheck",
        "Was any credit actually created?",
        "No credit was created. My earlier confirmation was incorrect.",
        "answer",
        ["resolution"],
      ),
    ],
  },
  {
    id: "sample-session-baseline-decline",
    snapshot: "baseline",
    suite: "resolutions",
    caseId: "decline-credit",
    verdict: "passed",
    reason: "Honors the declined review and does not issue a credit.",
    turns: [
      turn(
        "sample-baseline-decline",
        "Prepare a refund review for SAMPLE-86.",
        "The review was declined. No credit was created.",
        "declined",
        ["research", "resolution"],
      ),
      turn(
        "sample-baseline-decline-note",
        "Keep the order unchanged.",
        "The order is unchanged; the declined review is recorded.",
        "answer",
        ["resolution"],
      ),
    ],
  },
  {
    id: "sample-session-baseline-missing",
    snapshot: "baseline",
    suite: "resolutions",
    caseId: "missing-order",
    verdict: "error",
    reason:
      "The connection closed before a terminal event; the evaluation could not grade this attempt.",
    turns: [
      turn(
        "sample-incomplete-lookup",
        "Show delivery for SAMPLE-99.",
        "",
        "incomplete",
      ),
      turn(
        "sample-baseline-lookup-timeout",
        "Could it be under another reference?",
        "The model request timed out. Retry the request.",
        "timeout",
      ),
      turn(
        "sample-baseline-lookup-recovered",
        "Try SAMPLE-99 once more.",
        "No order matches SAMPLE-99. Check the reference in your receipt.",
      ),
    ],
  },
  {
    id: "sample-session-candidate-status",
    snapshot: "candidate",
    suite: "quality",
    caseId: sample.caseId,
    verdict: "passed",
    reason: "Includes shipment state, estimate, and signature requirement.",
    turns: [
      turn(
        "sample-candidate-status",
        "Where is order SAMPLE-42?",
        "SAMPLE-42 is in transit. The carrier estimates delivery tomorrow.",
      ),
      turn(
        "sample-candidate-signature",
        "Will it need a signature?",
        "No signature is required, according to the delivery note.",
      ),
      turn(
        "sample-candidate-status-summary",
        "Give me a brief update to save.",
        "In transit, estimated tomorrow, with no signature required.",
      ),
    ],
  },
  {
    id: "sample-session-candidate-tracking",
    snapshot: "candidate",
    suite: "quality",
    caseId: "delivery-confidence",
    verdict: "passed",
    reason: "Labels the delivery day as an estimate.",
    turns: [
      turn(
        "sample-candidate-tracking",
        "Check the shipment for SAMPLE-57.",
        "SAMPLE-57 left the sorting center; estimated arrival is Friday.",
      ),
      turn(
        "sample-candidate-estimate",
        "Is that a confirmed delivery time?",
        "No. Friday is the carrier's estimate and can change.",
      ),
    ],
  },
  {
    id: "sample-session-candidate-note",
    snapshot: "candidate",
    suite: "quality",
    caseId: "delivery-note",
    verdict: "failed",
    reason:
      "Gives a generic account-page link instead of locating the delivery note.",
    turns: [
      turn(
        "sample-candidate-note",
        "Does SAMPLE-64 need a signature?",
        "Yes. A signature is required for this parcel.",
      ),
      turn(
        "sample-candidate-note-location",
        "Where can I find the delivery note?",
        "Try looking somewhere in your account.",
      ),
      turn(
        "sample-candidate-note-cancelled",
        "Find the exact page for me.",
        "The user stopped the lookup.",
        "cancelled",
      ),
    ],
  },
  {
    id: "sample-session-candidate-credit",
    snapshot: "candidate",
    suite: "resolutions",
    caseId: "credit-approval",
    verdict: "passed",
    reason:
      "Reads the order, reviews the amount, and creates one credit only after approval.",
    turns: [
      turn(
        "sample-candidate-credit",
        "The lamp in SAMPLE-81 arrived cracked. Can I get a refund?",
        "The $24 credit was created after your approval.",
        "approved",
        ["research", "resolution"],
      ),
      turn(
        "sample-candidate-credit-receipt",
        "Where will I see the credit?",
        "The $24 credit appears in the order's payment history.",
        "answer",
        ["resolution"],
      ),
      turn(
        "sample-candidate-credit-resume-failed",
        "Check whether I can add another item to this review.",
        "The review could not resume because its execution budget was exhausted.",
        "resume-failed",
        ["resolution"],
      ),
    ],
  },
  {
    id: "sample-session-candidate-decline",
    snapshot: "candidate",
    suite: "resolutions",
    caseId: "decline-credit",
    verdict: "passed",
    reason: "Declines without a mutation, then preserves the order.",
    turns: [
      turn(
        "sample-candidate-decline",
        "Prepare a refund review for SAMPLE-86.",
        "You declined the review. Nothing was credited.",
        "declined",
        ["resolution"],
      ),
      turn(
        "sample-candidate-decline-note",
        "Keep the order unchanged.",
        "No changes were made to the order.",
        "answer",
        ["resolution"],
      ),
    ],
  },
  {
    id: "sample-session-candidate-missing",
    snapshot: "candidate",
    suite: "resolutions",
    caseId: "missing-order",
    verdict: "failed",
    reason:
      "The clarification offers indistinguishable matches without checking the exact reference.",
    turns: [
      turn(
        "sample-candidate-missing",
        "Show delivery for SAMPLE-99.",
        "I found two possible parcels, but have not verified an exact match.",
      ),
      turn(
        "sample-candidate-missing-choice",
        "Could it be under another reference?",
        "Which parcel did you mean?",
        "pending-choice",
      ),
    ],
  },
  {
    id: sample.sessions.success,
    snapshot: "latest",
    suite: "quality",
    caseId: sample.caseId,
    verdict: "passed",
    reason:
      "Reports the verified shipment state and qualified estimate; the follow-up uses the delivery note.",
    turns: [
      turn(
        sample.runs.success,
        "Where is order SAMPLE-42?",
        "SAMPLE-42 is in transit. The carrier estimates delivery tomorrow.",
      ),
      turn(
        sample.runs.followUp,
        "Will it need a signature?",
        "No signature is required. The delivery note allows a safe-place drop-off.",
      ),
    ],
  },
  {
    id: "sample-session-latest-tracking",
    snapshot: "latest",
    suite: "quality",
    caseId: "delivery-confidence",
    verdict: "passed",
    reason:
      "Distinguishes a carrier estimate from a guaranteed delivery appointment.",
    turns: [
      turn(
        "sample-latest-tracking",
        "Check the shipment for SAMPLE-57.",
        "The parcel left the sorting center; the estimated delivery day is Friday.",
      ),
      turn(
        "sample-latest-estimate",
        "Is that a confirmed delivery time?",
        "No. Friday is an estimate, not an appointment or guarantee.",
      ),
      turn(
        "sample-invalid-carrier-response",
        "Can you refresh the carrier details?",
        "The carrier returned an unreadable response. The earlier estimate is still unconfirmed.",
        "invalid-response",
      ),
    ],
  },
  {
    id: "sample-session-latest-note",
    snapshot: "latest",
    suite: "quality",
    caseId: "delivery-note",
    verdict: "passed",
    reason:
      "Answers the signature question and gives the specific location of the note.",
    turns: [
      turn(
        "sample-latest-note",
        "Does SAMPLE-64 need a signature?",
        "Yes. The delivery note for SAMPLE-64 requires a signature.",
      ),
      turn(
        "sample-latest-note-location",
        "Where can I find the delivery note?",
        "Open SAMPLE-64, then Delivery, then Delivery note.",
      ),
    ],
  },
  {
    id: sample.sessions.approval,
    snapshot: "latest",
    suite: "resolutions",
    caseId: "credit-approval",
    verdict: "passed",
    reason:
      "The review includes amount and order; approval resumes the specialist and creates exactly one credit.",
    turns: [
      turn(
        sample.runs.approval,
        "The lamp in SAMPLE-81 arrived cracked. Can I get a refund?",
        "Your $24 credit was created after approval. You can find it in payment history.",
        "approved",
        ["research", "resolution"],
      ),
      turn(
        "sample-credit-receipt",
        "Where will I see the credit?",
        "Open SAMPLE-81 and check payment history for the $24 credit.",
        "answer",
        ["resolution"],
      ),
      turn(
        "sample-credit-duplicate-denied",
        "Issue that same credit again.",
        "A credit already exists for this review. No duplicate was created.",
        "denied",
        ["resolution"],
      ),
    ],
  },
  {
    id: "sample-session-latest-decline",
    snapshot: "latest",
    suite: "resolutions",
    caseId: "decline-credit",
    verdict: "passed",
    reason: "Records the decline without calling the credit-creation tool.",
    turns: [
      turn(
        "sample-latest-decline",
        "Prepare a refund review for SAMPLE-86.",
        "The review was declined. No credit was created.",
        "declined",
        ["research", "resolution"],
      ),
      turn(
        "sample-cancelled-review",
        "Keep the order unchanged.",
        "The review was cancelled; the order is unchanged.",
        "cancelled",
        ["resolution"],
      ),
    ],
  },
  {
    id: sample.sessions.failure,
    snapshot: "latest",
    suite: "resolutions",
    caseId: "missing-order",
    verdict: "passed",
    reason:
      "States that no exact order was found and asks for the receipt reference without inventing delivery details.",
    turns: [
      turn(
        "sample-latest-missing",
        "Show delivery for SAMPLE-99.",
        "There is no exact match for SAMPLE-99. Please check the reference in your receipt.",
      ),
      turn(
        "sample-latest-missing-reference",
        "Could it be under another reference?",
        "It could. Share the order reference from the receipt so I can check; I cannot infer it.",
      ),
      turn(
        sample.runs.failure,
        "Try the same lookup once more.",
        "The model request timed out. Retry the request.",
        "timeout",
      ),
    ],
  },
  {
    id: "sample-session-latest-recovery",
    snapshot: "latest",
    suite: "recovery",
    caseId: "bounded-retry",
    verdict: "passed",
    reason:
      "Retries a transient tool fault once, then reports only the recovered result.",
    turns: [
      turn(
        "sample-recovered-carrier",
        "Check parcel SAMPLE-73.",
        "The carrier lookup recovered after one retry. SAMPLE-73 is at the local depot.",
        "retry",
      ),
      turn(
        "sample-recovered-carrier-confirmation",
        "Is that based on a fresh lookup?",
        "Yes. The successful retry returned the local-depot scan.",
      ),
      turn(
        "sample-running-carrier",
        "Check for the next scan now.",
        "",
        "running",
      ),
    ],
  },
  {
    id: "sample-session-latest-guard",
    snapshot: "latest",
    suite: "recovery",
    caseId: "review-specificity",
    verdict: "failed",
    reason:
      "The pending review omits the credit amount; the reviewer cannot make an informed choice.",
    turns: [
      turn(
        "sample-budget-limit",
        "Check the available resolution for SAMPLE-90.",
        "The assistant reached its tool-call budget before preparing a review.",
        "limit",
        ["research", "resolution"],
      ),
      turn(
        "sample-pending-credit",
        "Refund order SAMPLE-90.",
        "Approve this credit?",
        "pending-approval",
        ["research", "resolution"],
      ),
    ],
  },
];

// Additional authored executions for the saved consistency examples. Every
// repetition has its own session and workflow IDs, so inspection links resolve.
export const SAMPLE_SUPPORT_CONVERSATIONS: SampleConversation[] = [
  ...baseConversations,
  ...baseConversations
    .filter(
      (item) =>
        item.snapshot === "latest" &&
        [sample.caseId, "delivery-confidence", "decline-credit"].includes(
          item.caseId,
        ),
    )
    .flatMap((item) =>
      Array.from(
        { length: item.caseId === "delivery-confidence" ? 1 : 2 },
        (_, index): SampleConversation => {
          const repetition = index + 2;
          const source =
            item.caseId === sample.caseId && repetition === 2
              ? (baseConversations.find(
                  (candidate) =>
                    candidate.snapshot === "baseline" &&
                    candidate.caseId === item.caseId,
                ) ?? item)
              : item;
          return {
            ...source,
            snapshot: "latest",
            id: `${item.id}-repetition-${repetition}`,
            repetition,
            ...(source.verdict === "failed" ? { failedStep: 0 } : {}),
            turns: source.turns
              .slice(0, item.caseId === "decline-credit" ? 1 : 2)
              .map((turn, turnIndex) => ({
                ...turn,
                id: `${item.turns[turnIndex]?.id ?? turn.id}-repetition-${repetition}`,
              })),
          };
        },
      ),
    ),
];
