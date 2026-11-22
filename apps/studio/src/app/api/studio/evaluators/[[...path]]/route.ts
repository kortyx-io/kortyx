import { proxyEvaluatorRequest } from "@/features/evaluators/api/proxy";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyEvaluatorRequest(request, (await context.params).path ?? []);
}
export const POST = GET;
