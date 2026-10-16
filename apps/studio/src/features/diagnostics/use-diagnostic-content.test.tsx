// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";
import { StudioRouteProvider } from "@/components/studio-route-provider";
import { studioFetch } from "@/lib/studio-fetch";
import { useDiagnosticContent } from "./use-diagnostic-content";

const { end, fail, operation } = vi.hoisted(() => {
  const end = vi.fn();
  const fail = vi.fn();
  return { end, fail, operation: vi.fn(() => ({ end, fail })) };
});
vi.mock("@/usage/client", () => ({ studioOperation: operation }));
vi.mock("@/lib/studio-fetch", () => ({ studioFetch: vi.fn() }));

it("restores visited error content synchronously without re-fetching or exposing another workspace's cache", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const config = { provider: () => new Map() };
  const projectA = "prj_0123456789abcdef01234567";
  const projectB = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
  let mounted = true;
  let id = "first";
  let project = projectA;
  let pending!: (response: Response) => void;
  vi.mocked(studioFetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        pending = resolve;
      }),
  );
  const response = (message: string) =>
    Response.json({
      schemaVersion: 1,
      data: { message },
      capture: { status: "complete", omissions: [], redactions: [] },
    });
  function Reader() {
    const { data, isLoading } = useDiagnosticContent(id, "production");
    return (
      <span>
        {(data?.data.message as string) ?? (isLoading ? "Loading" : "Empty")}
      </span>
    );
  }
  async function render() {
    await act(async () => {
      root.render(
        <SWRConfig value={config}>
          <StudioRouteProvider scope={{ projectPublicId: project }}>
            {mounted && <Reader key={id} />}
          </StudioRouteProvider>
        </SWRConfig>,
      );
    });
  }
  async function complete(message: string) {
    await act(async () => {
      pending(response(message));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  try {
    await render();
    await complete("First original error");
    expect(container.textContent).toBe("First original error");
    id = "second";
    await render();
    expect(container.textContent).toBe("Loading");
    await complete("Second original error");
    mounted = false;
    await render();
    mounted = true;
    id = "first";
    await render();
    expect(container.textContent).toBe("First original error");
    expect(studioFetch).toHaveBeenCalledTimes(2);
    project = projectB;
    await render();
    expect(container.textContent).toBe("Loading");
    expect(container.textContent).not.toContain("First original error");
    await complete("Other project error");
    expect(container.textContent).toBe("Other project error");
    expect(studioFetch).toHaveBeenCalledTimes(3);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(operation).toHaveBeenCalledWith("studio.diagnostic", {
      resource: "diagnostics",
      origin: "background",
      action: "view",
    });
    expect(end).toHaveBeenCalledTimes(3);
    expect(fail).not.toHaveBeenCalled();
    expect(JSON.stringify(operation.mock.calls)).not.toContain(projectA);
    expect(JSON.stringify(operation.mock.calls)).not.toContain(
      "original error",
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
