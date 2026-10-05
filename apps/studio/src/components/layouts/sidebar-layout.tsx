import { studioShell } from "@studio/shell";
import { cookies } from "next/headers";
import { DetailStackProvider } from "@/components/detail/detail-stack";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getStudioShellContext } from "@/lib/studio-context";
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

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <DetailStackProvider>
        <AppSidebar studioContext={studioContext} shell={shell} />
        <SidebarInset className="h-svh overflow-hidden bg-sidebar">
          <header className="flex h-12 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 h-6! self-center"
            />
            <WorkspaceNavigation
              project={studioContext.scope.project}
              environments={studioContext.scope.telemetryEnvironments}
              projectSwitcher={shell.projectSwitcher}
              organizationSwitcher={shell.organizationSwitcher}
            />
          </header>
          <main className="min-h-0 flex-1 overflow-hidden pr-4 pb-4">
            {children}
          </main>
        </SidebarInset>
        {detailSlots}
      </DetailStackProvider>
    </SidebarProvider>
  );
}
