// @vitest-environment jsdom
import type { PromptLibrary } from "@kortyx/telemetry-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";
import { StudioRouteProvider } from "@/components/studio-route-provider";
import { promptRequest } from "../api/client";
import { usePromptLibrary, useRefreshPromptData } from "./use-prompt-data";

vi.mock("../api/client", () => ({ promptRequest: vi.fn() }));

const empty: PromptLibrary = {
  schemaVersion: 1,
  assets: [],
  categories: [],
  groups: [],
  totalCount: 0,
  nextCursor: null,
  permissions: { edit: true, promote: true, review: true, settings: true },
};
const updated: PromptLibrary = {
  ...empty,
  totalCount: 1,
  assets: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "New prompt",
      key: "new-prompt",
      categoryId: null,
      latestVersion: 1,
      revision: 1,
      archived: false,
      updatedAt: "2026-10-12T00:00:00Z",
      assignments: [],
    },
  ],
};

it("updates an unmounted list before revisiting cached server data, only in the current project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const cache = new Map();
  const config = { provider: () => cache, dedupingInterval: 0 };
  const container = document.createElement("div");
  const root = createRoot(container);
  const projectA = "prj_0123456789abcdef01234567";
  const projectB = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
  let refresh: ReturnType<typeof useRefreshPromptData>;
  function List() {
    const { data } = usePromptLibrary(empty, "library?categoryId=root");
    return <span>{data?.totalCount}</span>;
  }
  function Mutation() {
    refresh = useRefreshPromptData();
    return null;
  }
  async function render(projectPublicId: string, list: boolean) {
    await act(async () => {
      root.render(
        <SWRConfig value={config}>
          <StudioRouteProvider scope={{ projectPublicId }}>
            {list ? <List /> : <Mutation />}
          </StudioRouteProvider>
        </SWRConfig>,
      );
    });
  }
  try {
    vi.mocked(promptRequest).mockResolvedValue(empty);
    await render(projectB, true);
    await render(projectA, true);
    expect(container.textContent).toBe("0");
    await render(projectA, false);
    vi.mocked(promptRequest).mockClear().mockResolvedValue(updated);
    await act(async () => {
      await refresh();
    });
    expect(promptRequest).toHaveBeenCalledTimes(1);
    expect(promptRequest).toHaveBeenCalledWith(
      "library?categoryId=root",
      undefined,
      undefined,
      `/projects/${projectA}/prompts`,
    );
    // Hold the revisit's background read indefinitely: first paint must come
    // from the completed mutation, not the old RSC fallback or a new fetch.
    vi.mocked(promptRequest).mockImplementation(() => new Promise(() => {}));
    await render(projectA, true);
    expect(container.textContent).toBe("1");
    await render(projectB, true);
    expect(container.textContent).toBe("0");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
