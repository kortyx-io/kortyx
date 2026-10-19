import { STUDIO_REQUEST_PATH } from "../lib/studio-routing";

export const STUDIO_AUTH_FAILURE = "kortyx:auth-failure";

/** One monitor per signed-in shell, including when live data is paused. */
export function monitorStudioSession(browser: Window) {
  const controller = new AbortController();
  let pending = false;
  let navigating = false;
  const check = async () => {
    if (pending || navigating || controller.signal.aborted) return;
    pending = true;
    try {
      const response = await browser.fetch("/api/studio/session", {
        headers: {
          [STUDIO_REQUEST_PATH]:
            browser.location.pathname + browser.location.search,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]),
      });
      if (!response.ok) return;
      const status = await response.json();
      if (status.reauthenticate === true && !controller.signal.aborted) {
        navigating = true;
        // The document request lets the adapter own login and the return URL.
        browser.location.reload();
      }
    } catch {
      // Offline/server failures are not evidence that the session expired.
    } finally {
      pending = false;
    }
  };
  const onVisible = () => {
    if (browser.document.visibilityState === "visible") void check();
  };
  const onRestore = (event: PageTransitionEvent) => {
    if (event.persisted) void check();
  };
  // Keep polling hidden tabs too, so login can be ready before the user returns.
  // The browser may delay timers or suspend them entirely while frozen.
  const timer = browser.setInterval(() => void check(), 60_000);
  browser.addEventListener("focus", check);
  browser.addEventListener("online", check);
  browser.addEventListener("pageshow", onRestore);
  browser.addEventListener(STUDIO_AUTH_FAILURE, check);
  browser.document.addEventListener("resume", check);
  browser.document.addEventListener("visibilitychange", onVisible);
  void check();
  return () => {
    controller.abort();
    browser.clearInterval(timer);
    browser.removeEventListener("focus", check);
    browser.removeEventListener("online", check);
    browser.removeEventListener("pageshow", onRestore);
    browser.removeEventListener(STUDIO_AUTH_FAILURE, check);
    browser.document.removeEventListener("resume", check);
    browser.document.removeEventListener("visibilitychange", onVisible);
  };
}
