import type {
  Interrupt,
  InterruptStatus,
  InterruptType,
} from "@/features/interrupts/types";

const statuses: InterruptStatus[] = [
  "pending",
  "pending",
  "resolved",
  "expired",
  "failed",
  "cancelled",
];
const types: InterruptType[] = ["choice", "multi-choice", "text"];
const questions = [
  "Approve account merge for Acme account?",
  "Which deployment target should receive this workflow?",
  "Provide the missing billing reference.",
  "Confirm whether the customer may be contacted.",
];
export async function getMockInterrupts(): Promise<Interrupt[]> {
  const now = Date.now();
  return Array.from({ length: 34 }, (_, index) => {
    const status = statuses[index % statuses.length];
    const type = types[index % types.length];
    const createdAt = new Date(now - (index * 11 + 2) * 60_000).toISOString();
    const closed = status !== "pending";
    const resumeOutcome =
      status === "resolved"
        ? "resumed"
        : status === "failed"
          ? "resume failed"
          : status === "expired"
            ? "expired before resume"
            : status === "cancelled"
              ? "cancelled"
              : undefined;
    return {
      id: `int_${(0x1a71b0 + index * 7171).toString(16)}${index.toString().padStart(2, "0")}`,
      status,
      type,
      createdAt,
      resolvedAt: closed
        ? new Date(
            Date.parse(createdAt) + (35 + index * 7) * 1000,
          ).toISOString()
        : undefined,
      question: questions[index % questions.length],
      optionCount: type === "text" ? undefined : 2 + (index % 3),
      workflow: [
        "customer-support",
        "research-assistant",
        "onboarding-agent",
        "document-intake",
      ][index % 4],
      node: [
        "approval",
        "select-target",
        "collect-reference",
        "contact-consent",
      ][index % 4],
      session: `ses_${(0x8ab391 + index * 3187).toString(16)}`,
      user:
        index % 4 === 3
          ? undefined
          : ["usr_ada", "usr_liam", "usr_maya"][index % 3],
      tenant:
        index % 5 === 4
          ? undefined
          : ["acme", "northstar", "globex"][index % 3],
      response:
        status === "pending"
          ? undefined
          : type === "text"
            ? "INV-2026-1148"
            : index % 2 === 0
              ? "Approve"
              : "Staging, Production",
      resumeOutcome,
      resumeError:
        status === "failed"
          ? "Checkpoint state could not be restored"
          : undefined,
      runId: `run_01HZZ${(400000 + index * 632).toString(36).toUpperCase()}`,
      resumeToken: `resume_${(0x99218 + index * 73).toString(16)}`,
      resolvedBy: status === "resolved" ? "usr_ops_01" : undefined,
      environment:
        index % 3 === 0
          ? "Production"
          : index % 3 === 1
            ? "Staging"
            : "Development",
    };
  });
}
