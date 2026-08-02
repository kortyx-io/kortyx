"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { DetailSkeleton } from "@/components/detail/detail-skeleton";

export function DetailDrawerLoading({
  basePath,
  title,
  description,
}: {
  basePath: string;
  title: string;
  description: string;
}) {
  const pathname = usePathname();
  const [matchPath] = useState(pathname);

  return (
    <DetailDrawer
      matchPath={matchPath}
      dismissPath={basePath}
      title={title}
      description={description}
    >
      <output aria-label={`Loading ${title.toLowerCase()}`}>
        <DetailSkeleton />
      </output>
    </DetailDrawer>
  );
}
