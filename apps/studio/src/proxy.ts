import { studioAuth } from "@studio/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest): Promise<Response> {
  return (await studioAuth.authorize(request)) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json)).*)",
  ],
};
