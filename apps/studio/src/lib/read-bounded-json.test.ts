import { expect, it, vi } from "vitest";
import { readBoundedJson } from "./read-bounded-json";

it("bounds chunked and advertised responses before parsing, cancelling excess data", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(10));
    },
    cancel,
  });
  await expect(readBoundedJson(new Response(stream), 15)).rejects.toThrow(
    "response limit",
  );
  expect(cancel).toHaveBeenCalledOnce();
  const advertised = new Response("{}", {
    headers: { "content-length": "1000" },
  });
  await expect(readBoundedJson(advertised, 100)).rejects.toThrow(
    "response limit",
  );
  expect(advertised.body?.locked).toBe(false);
});
it("decodes multi-byte JSON split across chunks without exceeding the byte budget", async () => {
  const encoded = new TextEncoder().encode('{"text":"☃"}');
  const stream = new ReadableStream({
    start(controller) {
      for (const value of encoded) controller.enqueue(new Uint8Array([value]));
      controller.close();
    },
  });
  expect(await readBoundedJson(new Response(stream), encoded.length)).toEqual({
    text: "☃",
  });
});
