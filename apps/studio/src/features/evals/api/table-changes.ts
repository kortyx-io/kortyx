import "server-only";
import { studioAuth } from "@studio/auth";
import { z } from "zod";
import { readEvaluationChanges } from "./changes";
import { readEvaluationDetail, readEvaluationHistory } from "./server";

/** Read after the table has rendered; never hold up the page's initial response. */
export async function readTableChanges(request: Request): Promise<Response> {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const params = new URL(request.url).searchParams;
  const baseline = params.get("baseline") ?? undefined;
  if (baseline && !z.uuid().safeParse(baseline).success)
    return Response.json(
      { error: "Choose a valid baseline." },
      { status: 400 },
    );
  const ids = z
    .array(z.uuid())
    .min(1)
    .max(250)
    .safeParse(params.get("ids")?.split(","));
  if (!ids.success || new Set(ids.data).size !== ids.data.length)
    return Response.json(
      { error: "Choose valid evaluation runs." },
      { status: 400 },
    );
  // Next wraps Request instances; clone public GET fields rather than Undici's private state.
  const scoped = new Request(request.url, {
    method: "GET",
    headers: request.headers,
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
  });
  try {
    const history = await readEvaluationHistory(scoped);
    const runs = [];
    for (const id of ids.data) {
      scoped.signal.throwIfAborted();
      runs.push(
        history.runs.find((run) => run.id === id) ??
          (await readEvaluationDetail(id, scoped)).run,
      );
    }
    const changes = await readEvaluationChanges(
      runs,
      history.runs,
      baseline,
      scoped,
      params.get("detail") === "1",
    );
    return Response.json(
      { changes },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Changes could not be loaded. Refresh to retry." },
      { status: request.signal.aborted ? 499 : 503 },
    );
  }
}
