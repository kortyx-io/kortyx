import { proxyPromptRequest } from "@/features/prompts/api/proxy";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyPromptRequest(request, (await context.params).path);
}
export const POST = GET;
