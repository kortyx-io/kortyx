import type { ReactNode } from "react";
import { MarketingFooter } from "./marketing-footer";

export function MarketingShell({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <>
      <main id="main-content" tabIndex={-1} className={className}>
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
