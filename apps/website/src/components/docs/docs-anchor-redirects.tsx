"use client";

import { useEffect } from "react";

/** URL fragments never reach the server. Preserve bookmarks to sections split into new guides. */
export function DocsAnchorRedirects({
  redirects,
}: {
  redirects: Record<string, string>;
}) {
  useEffect(() => {
    const follow = () => {
      let fragment = window.location.hash.slice(1);
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        return;
      }
      const destination = redirects[fragment];
      if (typeof destination !== "string" || !destination.startsWith("/docs/"))
        return;
      const target = new URL(destination, window.location.origin);
      target.search = window.location.search;
      window.location.replace(target.href);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [redirects]);

  return (
    <>
      {Object.keys(redirects).map((id) => (
        <span key={id} id={id} aria-hidden="true" />
      ))}
    </>
  );
}
