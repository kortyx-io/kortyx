import { type NextRequest, NextResponse } from "next/server";
import { getStudioAuthConfig } from "@/lib/studio-auth";

const BASIC_REALM = "Kortyx Studio";

const unauthorized = () =>
  new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${BASIC_REALM}", charset="UTF-8"`,
    },
  });

const unavailable = (message: string) =>
  new NextResponse(message, {
    status: 500,
  });

const constantTimeEqual = (left: string, right: string): boolean => {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
};

const parseBasicAuthorization = (
  authorization: string | null,
): { username: string; password: string } | undefined => {
  if (!authorization?.startsWith("Basic ")) return undefined;

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator < 0) return undefined;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
};

const isAuthorized = (
  authorization: string | null,
  expectedUsername: string,
  expectedPassword: string,
): boolean => {
  const credentials = parseBasicAuthorization(authorization);
  if (!credentials) return false;

  return (
    constantTimeEqual(credentials.username, expectedUsername) &&
    constantTimeEqual(credentials.password, expectedPassword)
  );
};

export function proxy(request: NextRequest) {
  const config = getStudioAuthConfig();

  if (config.mode === "none") {
    return NextResponse.next();
  }

  if (config.mode === "cloud") {
    return unavailable(
      "Cloud Studio auth mode is not available in this build.",
    );
  }

  if (config.mode === "invalid") {
    return unavailable(
      `Invalid KORTYX_STUDIO_AUTH_MODE '${config.value}'. Expected one of: none, basic, cloud.`,
    );
  }

  if (!config.username || !config.password) {
    return unavailable(
      "Kortyx Studio Basic Auth is enabled, but username/password env vars are missing.",
    );
  }

  if (
    !isAuthorized(
      request.headers.get("authorization"),
      config.username,
      config.password,
    )
  ) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json)).*)",
  ],
};
