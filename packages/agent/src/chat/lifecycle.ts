import { KortyxError } from "@kortyx/core/errors";
import type { FinalizedChatMessage } from "@kortyx/stream";

export type ChatResponseStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ChatResponseFinalized = {
  sessionId: string;
  runId: string;
  clientTurnId: string;
  status: ChatResponseStatus;
  message: FinalizedChatMessage;
  checkpointId?: string;
};

export type ChatLifecyclePhase =
  | "turn-accepted"
  | "response-finalized"
  | "forked"
  | "rolled-back";

export class ChatLifecycleHookError extends KortyxError {
  readonly phase: ChatLifecyclePhase;

  constructor(phase: ChatLifecyclePhase, cause: unknown) {
    super(
      "CHAT_LIFECYCLE_HOOK_FAILED",
      `Chat lifecycle hook failed: ${phase}`,
      {
        category: "persistence",
        retryable: null,
        safeMessage: "Chat state could not be saved.",
        cause,
      },
    );
    this.name = "ChatLifecycleHookError";
    this.phase = phase;
  }
}
