"use client";

import { type ReactNode, useState } from "react";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailSkeleton } from "@/components/detail/detail-skeleton";
import { usePathname } from "@/lib/scoped-navigation";

export function DetailDrawerLoading({
  basePath,
  title,
  description,
  header,
  children,
}: {
  basePath: string;
  title: string;
  description: string;
  header?: ReactNode;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const [matchPath] = useState(pathname);

  return (
    <DetailDrawer
      customHeader={Boolean(header)}
      matchPath={matchPath}
      dismissPath={basePath}
      title={title}
      description={description}
    >
      {header}
      <output
        className="block h-full min-h-0"
        aria-label={`Loading ${title.toLowerCase()}`}
      >
        {children ?? <DetailSkeleton />}
      </output>
    </DetailDrawer>
  );
}
