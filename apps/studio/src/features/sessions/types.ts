export type SessionStatus =
  | "running"
  | "completed"
  | "interrupted"
  | "failed"
  | "cancelled";
export type SessionSortKey =
  | "activity"
  | "duration"
  | "tokens"
  | "cost"
  | "runs"
  | "status";

export type Session = {
  id: string;
  status: SessionStatus;
  lastActivityAt: string;
  workflow: string;
  workflowCount: number;
  version: string;
  user?: string;
  tenant?: string;
  runs: number;
  succeeded: number;
  failed: number;
  interrupted: number;
  checkpoints?: number;
  hasFork?: boolean;
  duration?: number;
  tokens?: number;
  cost?: number;
  latestResult: string;
  latestError?: string;
  pendingInterrupt?: string;
  providers: ("OpenAI" | "Anthropic" | "Google")[];
  models: string[];
  tags: string[];
  environment: "Development" | "Staging" | "Production";
};
