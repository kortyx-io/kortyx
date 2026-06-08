import { createCheckpointRouteHandler } from "kortyx";
import { agent } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createCheckpointRouteHandler({ agent });
