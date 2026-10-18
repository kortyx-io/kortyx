"use client";

import { useConsentManager } from "@c15t/nextjs";

export function PrivacySettings({ className }: { className?: string }) {
  const { setActiveUI } = useConsentManager();

  return (
    <button
      type="button"
      onClick={() => setActiveUI("dialog")}
      aria-haspopup="dialog"
      className={className}
    >
      Privacy settings
    </button>
  );
}
