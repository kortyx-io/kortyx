import { createHash, timingSafeEqual } from "node:crypto";
import { StudioUpdateStatusSchema } from "@kortyx/telemetry-contracts";
import { getStudioAuthConfig } from "./studio-auth";

function authenticated(request: Request): boolean {
  const config = getStudioAuthConfig();
  if (config.mode !== "basic" || !config.username || !config.password)
    return false;
  const expected = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    hash(request.headers.get("authorization") ?? ""),
    hash(expected),
  );
}

export async function studioUpdateRequest(request: Request): Promise<Response> {
  if (!authenticated(request))
    return Response.json(
      {
        error:
          "Update management requires an authenticated Studio administrator.",
      },
      { status: 401 },
    );
  const url = process.env.KORTYX_STUDIO_UPDATER_URL;
  const token = process.env.KORTYX_STUDIO_UPDATE_TOKEN;
  if (!url || !token)
    return Response.json(
      {
        error:
          "This installation does not have an in-product updater. Manage updates through your deployment workflow, or use the Kortyx installer for local Docker update management.",
      },
      { status: 503 },
    );
  try {
    let path = "/status";
    let body: string | undefined;
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      if (
        !origin ||
        new URL(origin).host !== request.headers.get("host") ||
        request.headers.get("x-kortyx-update") !== "1"
      ) {
        return Response.json(
          { error: "Update requests must come from this Studio instance." },
          { status: 403 },
        );
      }
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return Response.json({ error: "Expected JSON." }, { status: 415 });
      const text = await request.text();
      if (text.length > 4096)
        return Response.json({ error: "Request too large." }, { status: 413 });
      const { action, ...data } = JSON.parse(text);
      if (!["check", "settings", "update"].includes(action))
        return Response.json(
          { error: "Unknown update action." },
          { status: 400 },
        );
      path = `/${action}`;
      body = JSON.stringify(data);
    }
    const upstream = await fetch(new URL(path, url), {
      method: request.method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const data = await upstream.json();
    if (!upstream.ok)
      return Response.json(
        {
          error:
            typeof data.error === "string"
              ? data.error
              : "Update request failed.",
        },
        { status: upstream.status },
      );
    return Response.json(StudioUpdateStatusSchema.parse(data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "The updater is unavailable. If an update is running, wait for Studio to reconnect.",
      },
      { status: 503 },
    );
  }
}
