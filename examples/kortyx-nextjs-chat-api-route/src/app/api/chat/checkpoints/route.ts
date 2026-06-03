import { createCheckpointRouteHandler } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createCheckpointRouteHandler({ agent });
