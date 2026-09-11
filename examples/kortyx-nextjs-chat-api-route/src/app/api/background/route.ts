import { randomUUID } from "node:crypto";
import { toSSE } from "kortyx";
import { cookies } from "next/headers";
import { after } from "next/server";
import { agent } from "@/lib/kortyx-client";
import { telemetry } from "@/lib/telemetry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const jar = await cookies();
  const sessionId =
    jar.get("background-demo-session")?.value ?? `demo-${randomUUID()}`;
  // Demo session isolation; production applications must derive scope from authenticated identity.
  jar.set("background-demo-session", sessionId, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  const stream = await agent.streamChat(
    [{ role: "user", content: "Review this example conversation." }],
    {
      sessionId,
      workflowId: "background-review",
      abortSignal: request.signal,
      onExecution: (completion) =>
        after(async () => {
          await completion;
          await telemetry?.flush();
        }),
    },
  );
  return toSSE(stream);
}
