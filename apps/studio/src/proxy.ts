import { type NextRequest, NextResponse } from "next/server";
import { studioEdition } from "@/edition";

export async function proxy(request: NextRequest): Promise<Response> {
  return (await studioEdition.authorize(request)) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json)).*)",
  ],
};
