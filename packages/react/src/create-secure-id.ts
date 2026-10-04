const toHex = (value: number): string => value.toString(16).padStart(2, "0");

/** Create an opaque identifier using Web Crypto in every supported runtime. */
export function createSecureId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error("Secure ID generation requires the Web Crypto API.");
  }
  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, toHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
