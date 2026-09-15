import { describe, expect, it, vi } from "vitest";
import { shutdownApiRuntime } from "../src/shutdown";

describe("API graceful shutdown", () => {
  it("stops readiness, drains HTTP, then closes shared dependencies", async () => {
    const events: string[] = [];
    const server = {
      close: (callback: (error?: Error) => void) => {
        events.push("drain");
        callback();
      },
    };

    await shutdownApiRuntime({
      markNotReady: () => events.push("not-ready"),
      server,
      studioChangeBus: {
        close: async () => {
          events.push("change-bus");
        },
      },
      database: {
        close: async () => {
          events.push("database");
        },
      },
      timeoutMs: 100,
    });

    expect(events).toEqual(["not-ready", "drain", "change-bus", "database"]);
  });

  it("forces lingering connections closed after the drain deadline", async () => {
    const closeAllConnections = vi.fn();
    const closeChangeBus = vi.fn(async () => undefined);
    const closeDatabase = vi.fn(async () => undefined);

    await expect(
      shutdownApiRuntime({
        markNotReady: () => undefined,
        server: {
          close: () => undefined,
          closeAllConnections,
        },
        studioChangeBus: { close: closeChangeBus },
        database: { close: closeDatabase },
        timeoutMs: 1,
      }),
    ).rejects.toThrow("HTTP drain exceeded 1ms");
    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(closeChangeBus).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
