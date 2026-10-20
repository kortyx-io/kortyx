import "server-only";
import { studioAuth } from "@studio/auth";
import { z } from "zod";
import { EvaluationChangesSchema } from "../lib/evaluation-changes";
import { readEvaluationChanges } from "./changes";
import { readEvaluationDetail, readEvaluationHistory } from "./server";

const QuerySchema = z.object({ run: z.uuid(), baseline: z.uuid().optional() });

/** Studio-only summary endpoint. Conversation evidence remains a separate scoped read. */
export async function readModalComparison(request: Request): Promise<Response> {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const query = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return Response.json(
      { error: "Choose a valid evaluation and comparison baseline." },
      { status: 400 },
    );
  try {
    const [{ run }, history] = await Promise.all([
      readEvaluationDetail(query.data.run, request),
      readEvaluationHistory(request),
    ]);
    if (run.id !== query.data.run) throw new Error("Unexpected evaluation");
    const changes = await readEvaluationChanges(
      [run],
      history.runs,
      query.data.baseline,
      request,
    );
    const comparison = EvaluationChangesSchema.parse(changes[run.id]);
    return Response.json(comparison, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "The comparison could not be loaded. Retry or choose another baseline.",
      },
      { status: 503 },
    );
  }
}
