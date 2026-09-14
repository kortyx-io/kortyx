"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { detailNavigationHref } from "@/lib/nuqs";

export function DetailLink({
  href,
  prefetch = false,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const searchParams = useSearchParams();
  // Automatic prefetch can resolve a nested detail to its standalone page in
  // production. Fetch on navigation to preserve the active intercepted stack.
  return (
    <Link
      href={detailNavigationHref(href, searchParams)}
      prefetch={prefetch}
      {...props}
    />
  );
}
