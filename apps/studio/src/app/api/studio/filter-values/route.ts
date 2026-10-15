import { studioAuth } from "@studio/auth";
export async function GET(request: Request) {
  const denial = await studioAuth.authorize(request);
  if (denial) return denial;
  const base = process.env.KORTYX_API_URL;
  const credential = await studioAuth.getApiCredential(request);
  if (!base || !credential)
    return Response.json(
      { error: "Studio API is not configured." },
      { status: 503 },
    );
  const query = new URL(request.url).searchParams;
  const url = new URL(
    `${base.replace(/\/$/, "")}/v1/studio/${query.get("resource") === "prompts" ? "prompts/filter-values" : query.get("resource") === "evaluations" ? "evals/evaluations/table" : "filter-values"}`,
  );
  if (query.get("resource") === "evaluations") {
    query.delete("resource");
    for (const key of ["range", "env", "startedAfter", "startedBefore"])
      query.delete(key);
  }
  url.search = query.toString();
  try {
    const response = await fetch(url, {
      headers: {
        authorization: credential.authorization,
        ...(credential.environment
          ? { "x-kortyx-environment": credential.environment }
          : {}),
        ...(credential.environmentId
          ? { "x-kortyx-environment-id": credential.environmentId }
          : {}),
        ...(credential.projectId
          ? { "x-kortyx-project-id": credential.projectId }
          : {}),
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      return Response.json(
        { error: "Filter suggestions unavailable." },
        { status: response.status },
      );
    return Response.json(await response.json());
  } catch {
    return Response.json(
      { error: "Filter suggestions unavailable." },
      { status: 503 },
    );
  }
}
