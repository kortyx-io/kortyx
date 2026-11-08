import "server-only";
import type { StudioAuthAdapter } from "@studio/auth-contracts";
import type { StudioShellAdapter } from "@studio/shell-contracts";

export const studioShell: StudioShellAdapter = {
  async resolve() {
    return {
      renderProjectSwitcher: ({ active }) =>
        active ? null : "Fixture real-project picker",
    };
  },
};

/** Test only: these headers are NOT a usable authentication mechanism. */
export const studioAuth: StudioAuthAdapter = {
  async authorize(request) {
    const actor = request.headers.get("x-studio-auth-fixture");
    return new URL(request.url).pathname.startsWith("/auth/") ||
      actor === "alice" ||
      actor === "bob" ||
      actor === "missing"
      ? null
      : new Response("Fixture denies application access", { status: 401 });
  },
  async getApiCredential(request?: Request) {
    const actor = request?.headers.get("x-studio-auth-fixture");
    return actor === "alice" || actor === "bob"
      ? { authorization: `Bearer fixture-${actor}` }
      : null;
  },
  async handleAuthRequest(_request: Request) {
    return Response.json({ adapter: "compiled-auth-fixture" });
  },
};
