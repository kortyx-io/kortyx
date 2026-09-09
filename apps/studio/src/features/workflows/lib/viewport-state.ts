import type { Viewport } from "@xyflow/react";

const STORAGE_KEY = "kortyx.studio.workflow-viewports";

function read(): Record<string, Viewport> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function workflowViewportKey(selection: string): string {
  const query = new URLSearchParams(window.location.search);
  query.sort();
  return `${selection}?${query}`;
}

export function loadWorkflowViewport(key: string): Viewport | undefined {
  const value = read()?.[key];
  return value &&
    [value.x, value.y, value.zoom].every(Number.isFinite) &&
    value.zoom > 0
    ? value
    : undefined;
}

export function saveWorkflowViewport(key: string, viewport: Viewport): void {
  try {
    const entries = Object.entries(read() ?? {})
      .filter(([id]) => id !== key)
      .slice(-19);
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries([...entries, [key, viewport]])),
    );
  } catch {
    // Storage can be disabled. The in-memory viewport still supports cached pages.
  }
}
