import { studioShell } from "@studio/shell";
import { StudioSetupGuide } from "@/features/onboarding/setup-guide";
import { getStudioShellContext } from "@/lib/studio-context";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  return (
    <div className="h-full overflow-y-auto rounded-2xl border bg-background p-6 sm:p-8">
      <div className="max-w-2xl">
        {studioShell.onboardingPage ? (
          await studioShell.onboardingPage()
        ) : (
          <StudioSetupGuide context={await getStudioShellContext()} />
        )}
      </div>
    </div>
  );
}
