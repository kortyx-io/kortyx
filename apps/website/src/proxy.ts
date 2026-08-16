import { createRemoteJWKSet, jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";

const PREVIEW_HOST = /^pr-\d+\.kortyx\.dev$/;

let cachedTeamDomain: string | undefined;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function requestHostname(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host =
    forwardedHost?.split(",", 1)[0] ?? request.headers.get("host") ?? "";

  return host.trim().toLowerCase().split(":", 1)[0] ?? "";
}

function accessJwks(teamDomain: string) {
  if (!cachedJwks || cachedTeamDomain !== teamDomain) {
    cachedTeamDomain = teamDomain;
    cachedJwks = createRemoteJWKSet(
      new URL(`${teamDomain}/cdn-cgi/access/certs`),
    );
  }

  return cachedJwks;
}

export async function proxy(request: NextRequest) {
  if (!PREVIEW_HOST.test(requestHostname(request))) {
    return NextResponse.next();
  }

  const audience = process.env.CLOUDFLARE_ACCESS_AUD;
  const configuredTeamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;

  if (!audience || !configuredTeamDomain) {
    return new NextResponse("Preview access is not configured.", {
      status: 503,
    });
  }

  const teamDomain = configuredTeamDomain.replace(/\/$/, "");
  const token = request.headers.get("cf-access-jwt-assertion");

  if (!token) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    await jwtVerify(token, accessJwks(teamDomain), {
      audience,
      issuer: teamDomain,
    });
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.next();
}
