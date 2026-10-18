import { redactDiagnosticText } from "@kortyx/telemetry-contracts";
export async function readEvalErrorResponse(
  response: Response,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return redactDiagnosticText(text + decoder.decode());
      text += decoder.decode(part.value, { stream: true });
      if (text.length > 65_536)
        return (
          redactDiagnosticText(text.slice(0, 65_536)) +
          " [response shortened at 64 KiB]"
        );
    }
  } catch (error) {
    return (
      redactDiagnosticText(text) +
      ` [response read failed: ${error instanceof Error ? redactDiagnosticText(error.message) : "unknown error"}]`
    );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
