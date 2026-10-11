import { Children, isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@studio/shell", () => ({
  studioShell: { resolve: async () => ({}) },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/studio-context", () => ({
  getStudioShellContext: async () => ({}),
}));
vi.mock("@/components/sidebar/app-sidebar", () => ({ AppSidebar: () => null }));

function findBody(node: ReactNode): string | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child))
      continue;
    if (child.type === "main") return child.props.className;
    const result = findBody(child.props.children);
    if (result) return result;
  }
}

it("keeps the shared content body's right and bottom gutters at one spacing unit", async () => {
  const { SidebarLayout } = await import("./sidebar-layout");
  const layout = await SidebarLayout({ children: <div>Content</div> });
  expect(findBody(layout)).toBe("min-h-0 flex-1 overflow-hidden pr-1 pb-1");
});
