import { studioEdition } from "@/edition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) =>
  studioEdition.handleAuthRequest(request);
export const POST = (request: Request) =>
  studioEdition.handleAuthRequest(request);
