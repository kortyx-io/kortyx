import type { ReactNode } from "react";
import { DetailSlotPresence } from "@/components/detail/detail-slot-presence";

export default function SessionsLayout({
  children,
  drawer,
}: {
  children: ReactNode;
  drawer: ReactNode;
}) {
  return (
    <>
      {children}
      <DetailSlotPresence basePath="/sessions">{drawer}</DetailSlotPresence>
    </>
  );
}
