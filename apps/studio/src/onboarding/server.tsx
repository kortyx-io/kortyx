import "server-only";
import { notFound } from "next/navigation";

/** Cloud supplies this compile-time extension; OSS has no account onboarding. */
export async function StudioOnboardingPage() {
  notFound();
}
export async function StudioLegalPage(_props: {
  params: Promise<{ slug: string; version: string }>;
}) {
  notFound();
}
