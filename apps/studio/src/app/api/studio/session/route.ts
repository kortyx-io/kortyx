import { studioAuth } from "@studio/auth";
import { checkStudioSession } from "@/auth/session";

export const GET = (request: Request) =>
  checkStudioSession(request, studioAuth);
