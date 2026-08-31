"use client";

import { ProgressProvider } from "@bprogress/next/app";

export function Providers({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProgressProvider
      color="#8f80ff"
      height="2px"
      delay={100}
      stopDelay={100}
      startPosition={0.12}
      options={{ showSpinner: false, trickleSpeed: 180 }}
    >
      {children}
    </ProgressProvider>
  );
}
