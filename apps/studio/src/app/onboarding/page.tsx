import { studioShell } from "@studio/shell";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!studioShell.onboardingPage) notFound();

  return (
    <div className="h-full overflow-y-auto rounded-2xl border bg-background p-6 sm:p-8">
      <div className="max-w-2xl">{await studioShell.onboardingPage()}</div>
    </div>
  );
}
