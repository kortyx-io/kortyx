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
}: {
  basePath: string;
  title: string;
  description: string;
  header?: ReactNode;
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
      <output aria-label={`Loading ${title.toLowerCase()}`}>
        <DetailSkeleton />
      </output>
    </DetailDrawer>
  );
}
