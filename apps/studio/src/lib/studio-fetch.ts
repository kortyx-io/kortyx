import { STUDIO_REQUEST_PATH } from "./studio-routing";

/** Browser scope intent is independently authorized server-side, not trusted. */
export function studioFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof window !== "undefined") {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.origin,
    );
    if (
      url.origin === window.location.origin &&
      /^\/(api|auth)\//.test(url.pathname)
    ) {
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      new Headers(init?.headers).forEach((value, key) => {
        headers.set(key, value);
      });
      headers.set(STUDIO_REQUEST_PATH, window.location.pathname);
      return fetch(input, { ...init, headers });
    }
  }
  return fetch(input, init);
}
