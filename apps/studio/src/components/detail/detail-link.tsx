"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { usePrepareDetailNavigation } from "@/components/detail/detail-stack";
import { detailNavigationHref } from "@/lib/nuqs";

export function DetailLink({
  href,
  prefetch = false,
  onNavigate,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const searchParams = useSearchParams();
  const prepareNavigation = usePrepareDetailNavigation();
  const targetHref = detailNavigationHref(href, searchParams);
  // Automatic prefetch can resolve a nested detail to its standalone page in
  // production. Fetch on navigation to preserve the active intercepted stack.
  return (
    <Link
      href={targetHref}
      prefetch={prefetch}
      {...props}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (!cancelled) prepareNavigation?.(targetHref);
      }}
    />
  );
}
