import { afterEach, describe, expect, it, vi } from "vitest";
import { createSecureId } from "../src/create-secure-id";

afterEach(() => vi.unstubAllGlobals());

describe("createSecureId", () => {
  it("uses randomUUID when available", () => {
    const randomUUID = vi.fn(() => "3cbe8e6d-9abf-4d09-8277-a6fcfff68923");
    vi.stubGlobal("crypto", { randomUUID });

    expect(createSecureId()).toBe("3cbe8e6d-9abf-4d09-8277-a6fcfff68923");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates an RFC 4122 version 4 UUID with getRandomValues", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(createSecureId()).toBe("abababab-abab-4bab-abab-abababababab");
  });

  it("fails closed when Web Crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => createSecureId()).toThrow("Web Crypto API");
  });
});
