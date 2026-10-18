import "server-only";
import { studioAuth } from "@studio/auth";
import { studioSettings } from "@studio/settings";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SAMPLE_RETURN_COOKIE,
  SAMPLE_VISIBILITY_COOKIE,
  safeSampleReturn,
} from "./routing";

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("enter"), returnTo: z.string().max(200) })
    .strict(),
  z.object({ action: z.literal("visibility"), visible: z.boolean() }).strict(),
]);
export async function samplePreferenceRequest(request: Request) {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const url = new URL(request.url);
  let sameOrigin = false;
  try {
    sameOrigin =
      new URL(request.headers.get("origin") ?? "").host ===
      (request.headers.get("host") ?? url.host);
  } catch {
    /* Reject malformed origins. */
  }
  if (
    request.method !== "POST" ||
    !sameOrigin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return Response.json({ error: "Request denied." }, { status: 403 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader)
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return Response.json({ error: "Request too large." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(buffer);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid preference." }, { status: 400 });
  }
  const parsed = input.safeParse(value);
  if (!parsed.success)
    return Response.json({ error: "Invalid preference." }, { status: 400 });
  const body = parsed.data;
  const jar = await cookies();
  const returnTo = safeSampleReturn(
    body.action === "enter"
      ? body.returnTo
      : jar.get(SAMPLE_RETURN_COOKIE)?.value,
  );
  const response = NextResponse.json({ returnTo });
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 31536000,
  };
  if (body.action === "visibility") {
    await studioSettings.sampleProjectVisibility?.set(body.visible);
    response.cookies.set(
      SAMPLE_VISIBILITY_COOKIE,
      String(body.visible),
      options,
    );
  } else {
    response.cookies.set(SAMPLE_RETURN_COOKIE, returnTo, options);
  }
  return response;
}
