"use client";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { studioHref } from "@/lib/studio-routing";
import { useStudioRouteScope } from "./studio-route-provider";

/** Native Next Link with edition-provided scope; OSS defaults stay unchanged. */
export default function ScopedLink({
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const scope = useStudioRouteScope();
  const scoped =
    typeof href === "string"
      ? studioHref(href, scope)
      : {
          ...href,
          ...(typeof href.pathname === "string"
            ? { pathname: studioHref(href.pathname, scope) }
            : {}),
        };
  return <NextLink {...props} href={scoped} />;
}
