import { STUDIO_AUTH_FAILURE } from "../auth/session-monitor";
import { STUDIO_REQUEST_PATH } from "./studio-routing";

/** Browser scope intent is independently authorized server-side, not trusted. */
export async function studioFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
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
      if (!headers.has(STUDIO_REQUEST_PATH))
        headers.set(STUDIO_REQUEST_PATH, window.location.pathname);
      const response = await fetch(input, { ...init, headers });
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.redirected
      )
        window.dispatchEvent(new Event(STUDIO_AUTH_FAILURE));
      return response;
    }
  }
  return fetch(input, init);
}
