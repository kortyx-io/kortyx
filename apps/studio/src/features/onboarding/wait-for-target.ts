/** Wait for route commit and visible content, including drawer exit animations. */
export function waitForTourTarget(
  ready: () => boolean,
  signal: AbortSignal,
  timeout = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const timer = window.setTimeout(
      () => finish(new Error("Tour target unavailable")),
      timeout,
    );
    function finish(error?: Error) {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    }
    function abort() {
      finish(new DOMException("Tour stopped", "AbortError"));
    }
    function check() {
      if (signal.aborted) return abort();
      if (ready()) return finish();
      frame = window.requestAnimationFrame(check);
    }
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}
