import { studioAuth } from "@studio/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => studioAuth.handleAuthRequest(request);
export const POST = (request: Request) => studioAuth.handleAuthRequest(request);
