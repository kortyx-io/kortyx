// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CostValue } from "./cost-value";
import { TooltipProvider } from "./ui/tooltip";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  const mount = document.createElement("div");
  container.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("shows only the numeric subtotal and exposes the caveat on keyboard focus", async () => {
  const rowClick = vi.fn();
  container.addEventListener("click", rowClick);
  await act(() =>
    root.render(
      <TooltipProvider delayDuration={0}>
        <CostValue
          value={{
            costSummary: {
              amounts: [{ amount: 0.56, currency: "USD" }],
              complete: false,
            },
          }}
        />
      </TooltipProvider>,
    ),
  );
  const button = container.querySelector("button");
  if (!button) throw new Error("Cost must be keyboard accessible");
  expect(button.textContent).toBe("$0.56+");
  await act(() => button.focus());
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "actual cost may be higher",
    ),
  );
  expect(
    document.querySelector('[role="dialog"] a')?.getAttribute("href"),
  ).toMatch(/metrics#cost-and-pricing$/);
  await act(() => button.click());
  expect(rowClick).not.toHaveBeenCalled();
});

it("explains an empty subtotal without claiming free execution", async () => {
  await act(() =>
    root.render(
      <TooltipProvider delayDuration={0}>
        <CostValue value={{ cost: null }} />
      </TooltipProvider>,
    ),
  );
  const button = container.querySelector("button");
  if (!button) throw new Error("Cost control is missing");
  expect(button.textContent).toBe("$0.00+");
  await act(() => button.focus());
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "actual cost is unknown",
    ),
  );
});
