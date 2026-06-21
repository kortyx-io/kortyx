export type InterruptStatus =
  | "pending"
  | "resolved"
  | "expired"
  | "failed"
  | "cancelled";
export type InterruptType = "choice" | "multi-choice" | "text";
export type ResumeOutcome =
  | "resumed"
  | "resume failed"
  | "expired before resume"
  | "cancelled";
export type InterruptSortKey = "priority" | "created" | "age" | "status";

export type Interrupt = {
  id: string;
  status: InterruptStatus;
  type: InterruptType;
  createdAt: string;
  resolvedAt?: string;
  question: string;
  optionCount?: number;
  workflow: string;
  node: string;
  session: string;
  user?: string;
  tenant?: string;
  response?: string;
  resumeOutcome?: ResumeOutcome;
  resumeError?: string;
  runId: string;
  resumeToken: string;
  resolvedBy?: string;
  environment: "Development" | "Staging" | "Production";
};
