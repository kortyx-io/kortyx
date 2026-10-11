"use client";

import { ProgressProvider } from "@bprogress/next/app";

const progressStyles = `
  .bprogress {
    position: fixed;
    inset: 0 0 auto;
    width: 100%;
    height: 3px;
    pointer-events: none;
    z-index: 99999;
  }

  .bprogress .bar {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0;
    height: 100%;
    background: #8f80ff;
  }

  .bprogress .peg,
  .bprogress .spinner {
    display: none;
  }
`;

export function Providers({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ProgressProvider
      color="#8f80ff"
      height="3px"
      delay={0}
      stopDelay={200}
      startPosition={0.15}
      style={progressStyles}
      options={{
        showSpinner: false,
        trickleSpeed: 180,
        positionUsing: "width",
      }}
    >
      {children}
    </ProgressProvider>
  );
}
