import { describe, expect, it } from "vitest";
import { POST as checkpointPost } from "@/app/api/chat/checkpoints/route";
import { POST as chatPost } from "@/app/api/chat/route";

type ChatPayload = {
  chunks: Array<Record<string, unknown>>;
  text: string;
  structured: Array<Record<string, unknown>>;
};

type ResumeRef = {
  resumeToken: string;
  requestId: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
};

const postJson = async <T>(
  handler: (request: Request) => Promise<Response>,
  url: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const response = await handler(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  const payload = (await response.json()) as T;
  expect(response.status).toBe(200);
  return payload;
};

const checkpointChunk = (payload: ChatPayload) =>
  payload.chunks.find((chunk) => chunk.type === "checkpoint");

const interruptChunk = (payload: ChatPayload): ResumeRef => {
  const interrupt = payload.chunks.find((chunk) => chunk.type === "interrupt");
  if (
    typeof interrupt?.resumeToken !== "string" ||
    typeof interrupt.requestId !== "string"
  ) {
    throw new Error("Expected interrupt chunk with resume metadata.");
  }
  return {
    resumeToken: interrupt.resumeToken,
    requestId: interrupt.requestId,
  };
};

const finalBrief = (payload: ChatPayload) => {
  const briefChunk = payload.structured.find(
    (chunk) => chunk.dataType === "checkpoint-lab.brief",
  );
  return briefChunk?.data as
    | { title: string; template: string; depth: string }
    | undefined;
};

const pendingResume = (request: {
  token: string;
  requestId: string;
}): ResumeRef => ({
  resumeToken: request.token,
  requestId: request.requestId,
});

const firstPendingRequest = (
  requests: Array<{ token: string; requestId: string }>,
) => {
  const [request] = requests;
  if (!request) throw new Error("Expected an active pending request.");
  return request;
};

const createChatDriver = (sessionId: string) => {
  const messages: ChatMessage[] = [];

  const send = async (
    content: string,
    resume?: ResumeRef,
  ): Promise<ChatPayload> => {
    messages.push(
      resume
        ? {
            role: "user",
            content,
            metadata: {
              resume: {
                token: resume.resumeToken,
                requestId: resume.requestId,
                selected: [content],
              },
            },
          }
        : { role: "user", content },
    );
    const payload = await postJson<ChatPayload>(
      chatPost,
      "https://kortyx.test/api/chat",
      {
        stream: false,
        sessionId,
        workflowId: "checkpoint-lab",
        messages,
      },
    );
    messages.push({
      role: "assistant",
      content: payload.text,
    });
    return payload;
  };

  const trimToLength = (length: number) => {
    messages.splice(length);
  };

  return { messages, send, trimToLength };
};

const rollback = async (checkpointId: string) =>
  postJson<{
    head: string;
    activePendingRequests: Array<{ token: string; requestId: string }>;
    invalidatedStructuredStreamIds: string[];
    invalidatedInterruptTokens: string[];
  }>(checkpointPost, "https://kortyx.test/api/chat/checkpoints", {
    action: "rollback",
    checkpointId,
  });

const fork = async (checkpointId: string, newSessionId: string) =>
  postJson<{
    sessionId: string;
    checkpoint: {
      activePendingRequests: Array<{ token: string; requestId: string }>;
    };
  }>(checkpointPost, "https://kortyx.test/api/chat/checkpoints", {
    action: "fork",
    checkpointId,
    newSessionId,
  });

describe("checkpoint-lab workflow checkpoint API", () => {
  it("supports repeated rollback to the first interrupt with different answers", async () => {
    const driver = createChatDriver(`checkpoint-lab-rollback-${Date.now()}`);

    const start = await driver.send(
      "Draft a rollout brief for workspace notifications",
    );
    const firstCheckpoint = checkpointChunk(start)?.id;
    expect(firstCheckpoint).toEqual(expect.any(String));

    const launch = await driver.send("launch", interruptChunk(start));
    const deep = await driver.send("deep", interruptChunk(launch));
    expect(finalBrief(deep)).toMatchObject({
      template: "launch",
      depth: "deep",
    });

    const firstRollback = await rollback(String(firstCheckpoint));
    expect(firstRollback.invalidatedStructuredStreamIds.length).toBeGreaterThan(
      0,
    );
    expect(firstRollback.invalidatedInterruptTokens.length).toBeGreaterThan(0);
    driver.trimToLength(2);

    const research = await driver.send(
      "research",
      pendingResume(firstPendingRequest(firstRollback.activePendingRequests)),
    );
    const standard = await driver.send("standard", interruptChunk(research));
    expect(finalBrief(standard)).toMatchObject({
      template: "research",
      depth: "standard",
    });

    const secondRollback = await rollback(String(firstCheckpoint));
    driver.trimToLength(2);

    const ops = await driver.send(
      "ops",
      pendingResume(firstPendingRequest(secondRollback.activePendingRequests)),
    );
    const compact = await driver.send("compact", interruptChunk(ops));
    expect(finalBrief(compact)).toMatchObject({
      template: "ops",
      depth: "compact",
    });
    expect(compact.text).not.toContain("Launch brief");
    expect(compact.text).not.toContain("Research brief");
  });

  it("forks from first and second interrupt checkpoints without reusing parent answers", async () => {
    const parentSessionId = `checkpoint-lab-fork-parent-${Date.now()}`;
    const parent = createChatDriver(parentSessionId);

    const start = await parent.send(
      "Draft a rollout brief for workspace notifications",
    );
    const firstCheckpoint = checkpointChunk(start)?.id;
    expect(firstCheckpoint).toEqual(expect.any(String));

    const launch = await parent.send("launch", interruptChunk(start));
    const secondCheckpoint = checkpointChunk(launch)?.id;
    expect(secondCheckpoint).toEqual(expect.any(String));

    const deep = await parent.send("deep", interruptChunk(launch));
    expect(finalBrief(deep)).toMatchObject({
      template: "launch",
      depth: "deep",
    });

    const firstFork = await fork(
      String(firstCheckpoint),
      `checkpoint-lab-fork-first-${Date.now()}`,
    );
    const firstChild = createChatDriver(firstFork.sessionId);
    firstChild.messages.push(...parent.messages.slice(0, 2));
    const research = await firstChild.send(
      "research",
      pendingResume(
        firstPendingRequest(firstFork.checkpoint.activePendingRequests),
      ),
    );
    const standard = await firstChild.send(
      "standard",
      interruptChunk(research),
    );
    expect(finalBrief(standard)).toMatchObject({
      template: "research",
      depth: "standard",
    });

    const secondFork = await fork(
      String(secondCheckpoint),
      `checkpoint-lab-fork-second-${Date.now()}`,
    );
    const secondChild = createChatDriver(secondFork.sessionId);
    secondChild.messages.push(...parent.messages.slice(0, 4));
    const compact = await secondChild.send(
      "compact",
      pendingResume(
        firstPendingRequest(secondFork.checkpoint.activePendingRequests),
      ),
    );
    expect(finalBrief(compact)).toMatchObject({
      template: "launch",
      depth: "compact",
    });
  });
});
