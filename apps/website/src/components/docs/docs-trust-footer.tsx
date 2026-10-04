import Link from "next/link";
import { PrivacySettings } from "@/components/consent/privacy-settings";

export function DocsTrustFooter() {
  const className =
    "inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";
  return (
    <footer className="mt-8 border-t border-border py-6">
      <nav
        aria-label="Website legal and trust information"
        className="flex flex-wrap gap-x-5 gap-y-1"
      >
        {[
          ["About", "/about"],
          ["Contact", "/contact"],
          ["Security & Data", "/security"],
          ["Privacy", "/privacy"],
          ["Website Terms", "/terms"],
          ["Legal", "/legal"],
          ["Cookies & Storage", "/cookies"],
        ].map(([label, href]) => (
          <Link key={href} href={href} className={className}>
            {label}
          </Link>
        ))}
        <PrivacySettings className={className} />
      </nav>
    </footer>
  );
}
