"use client";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { StudioRouteError } from "@/features/telemetry/components/studio-route-error";
import { usePathname } from "@/lib/scoped-navigation";
export default function JudgeInstructionsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  return (
    <DetailDrawer
      matchPath={pathname}
      dismissPath="/evals/runs"
      title="Judge instructions"
      description="Instructions could not load"
    >
      <StudioRouteError {...props} />
    </DetailDrawer>
  );
}
