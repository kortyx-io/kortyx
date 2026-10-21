/** Enforce the byte budget while reading, before JSON decoding or schema cloning. */
export async function readBoundedJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Comparison exceeds the response limit.");
  }
  if (!response.body) throw new Error("Missing comparison response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes)
        throw new Error("Comparison exceeds the response limit.");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const value = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    value.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(value));
}
