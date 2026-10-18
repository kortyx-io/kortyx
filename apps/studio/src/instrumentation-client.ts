import { BProgress } from "@bprogress/core";

/** One framework hook covers Link, native router calls, and browser history. */
export function onRouterTransitionStart(
  href: string,
  navigationType: "push" | "replace" | "traverse",
) {
  const target = new URL(href, window.location.href);
  if (
    navigationType !== "traverse" &&
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  ) {
    // A same-route navigation can cancel an older in-flight navigation.
    BProgress.done();
    return;
  }
  // The existing ProgressProvider configures the bar and stops it on commit.
  BProgress.set(0.15).start();
}
