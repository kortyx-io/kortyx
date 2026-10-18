import { studioShell } from "@studio/shell";
import { cookies } from "next/headers";
import { DetailStackProvider } from "@/components/detail/detail-stack";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { StudioRouteProvider } from "@/components/studio-route-provider";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LearningControls,
  LearningProvider,
} from "@/features/onboarding/provider";
import { SampleProjectSelector } from "@/features/sample-project/project-selector";
import {
  SAMPLE_RETURN_COOKIE,
  safeSampleReturn,
} from "@/features/sample-project/routing";
import {
  isSampleProject,
  readSampleProjectPreference,
} from "@/features/sample-project/server";
import { getStudioShellContext } from "@/lib/studio-context";
import { safeLearningGuides } from "@/lib/studio-learning-guides";
import { studioHref } from "@/lib/studio-routing";
import { WorkspaceLabelsProvider } from "./workspace-labels";
import { WorkspaceNavigation } from "./workspace-navigation";

export async function SidebarLayout({
  children,
  detailSlots,
}: {
  children: React.ReactNode;
  detailSlots?: React.ReactNode;
}) {
  const [cookieStore, studioContext] = await Promise.all([
    cookies(),
    getStudioShellContext(),
  ]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const shell = await studioShell.resolve(studioContext);
  const [sample, preference] = await Promise.all([
    isSampleProject(),
    readSampleProjectPreference(),
  ]);
  const routeScope = sample ? { sampleProject: true } : shell.routeScope;
  const returnTo = sample
    ? safeSampleReturn(
        cookieStore.get(SAMPLE_RETURN_COOKIE)?.value ??
          (shell.projectName || shell.routeScope?.projectPublicId
            ? studioHref("/runs", shell.routeScope)
            : "/onboarding"),
      )
    : studioContext.connection?.status === "connected" ||
        shell.projectName ||
        shell.routeScope?.projectPublicId
      ? studioHref("/runs", shell.routeScope)
      : "/onboarding";

  return (
    <StudioRouteProvider scope={routeScope}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <WorkspaceLabelsProvider>
          <DetailStackProvider>
            <LearningProvider
              sample={sample}
              visible={preference.visible}
              available={preference.available}
              returnTo={returnTo}
              setupHref="/onboarding"
              guides={safeLearningGuides(shell.learningGuides)}
            >
              <AppSidebar studioContext={studioContext} shell={shell} />
              <SidebarInset className="h-svh overflow-hidden bg-sidebar">
                <header className="flex h-12 shrink-0 items-center gap-2 px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator
                    orientation="vertical"
                    className="mr-2 h-6! self-center"
                  />
                  <WorkspaceNavigation
                    projectSwitcher={
                      <SampleProjectSelector
                        active={sample}
                        visible={preference.visible}
                        projectName={
                          shell.projectName ??
                          (sample
                            ? "Your project"
                            : studioContext.scope.project ===
                                "Project unavailable"
                              ? "Your project"
                              : studioContext.scope.project)
                        }
                        returnTo={returnTo}
                        realSwitcher={shell.projectSwitcher}
                      />
                    }
                    organizationSwitcher={
                      sample ? undefined : shell.organizationSwitcher
                    }
                    environmentSwitcher={
                      sample ? undefined : shell.environmentSwitcher
                    }
                  />
                  <LearningControls />
                </header>
                <main className="min-h-0 flex-1 overflow-hidden pr-1 pb-1">
                  {children}
                </main>
              </SidebarInset>
              {detailSlots}
            </LearningProvider>
          </DetailStackProvider>
        </WorkspaceLabelsProvider>
      </SidebarProvider>
    </StudioRouteProvider>
  );
}
