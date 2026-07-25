"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { detailNavigationHref } from "@/lib/nuqs";

export function DetailLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const searchParams = useSearchParams();
  return <Link href={detailNavigationHref(href, searchParams)} {...props} />;
}
