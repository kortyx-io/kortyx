import { createChatRouteHandler } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handleChat = createChatRouteHandler({ agent });

export async function POST(request: Request): Promise<Response> {
  // Keep route extensible for auth/rate-limit/observability hooks.
  return handleChat(request);
}
