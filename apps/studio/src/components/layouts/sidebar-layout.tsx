import { cookies } from "next/headers";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export async function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden bg-sidebar">
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-6! self-center" />
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <main className="h-full pr-4 pb-4">{children}</main>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
