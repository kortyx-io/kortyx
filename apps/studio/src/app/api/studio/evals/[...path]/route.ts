import { proxyEvalRequest } from "@/features/evals/api/proxy";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  return proxyEvalRequest(request, (await context.params).path);
}
export const POST = GET;
