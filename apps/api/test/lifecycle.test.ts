import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApiLifecycle, registerApiSignals } from "../src/lifecycle";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const work = deferred();
  const http = deferred();
  const abort = deferred();
  const worker = {
    drain: vi.fn(() => work.promise),
    stop: vi.fn(() => abort.promise),
  };
  const markNotReady = vi.fn();
  const drainHttp = vi.fn(() => http.promise);
  const closeResources = vi.fn(async () => {});
  const lifecycle = createApiLifecycle({
    worker,
    markNotReady,
    drainHttp,
    closeResources,
  });
  return {
    work,
    http,
    abort,
    worker,
    markNotReady,
    drainHttp,
    closeResources,
    lifecycle,
  };
}
describe("independent evaluation and HTTP retirement", () => {
  it("does not treat an undefined HTTP rejection as successful retirement", async () => {
    const f = fixture();
    const terminated = f.lifecycle.terminate();
    const rejected = expect(terminated).rejects.toBeUndefined();
    f.http.reject(undefined);
    f.work.resolve();
    await rejected;
    expect(f.closeResources).toHaveBeenCalledOnce();
  });

  it("prepares a singleton replacement while HTTP and cancellation remain available", async () => {
    const f = fixture();
    const prepared = f.lifecycle.drainEvaluations();
    expect(f.lifecycle.evaluationState()).toBe("draining");
    expect(f.markNotReady).not.toHaveBeenCalled();
    expect(f.drainHttp).not.toHaveBeenCalled();
    expect(f.closeResources).not.toHaveBeenCalled();
    f.work.resolve();
    await prepared;
    expect(f.lifecycle.evaluationState()).toBe("drained");
    expect(f.markNotReady).not.toHaveBeenCalled();
    const terminated = f.lifecycle.terminate();
    f.http.resolve();
    await terminated;
    expect(f.worker.drain).toHaveBeenCalledOnce();
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("drains HTTP immediately but keeps database resources for long evaluations", async () => {
    const f = fixture();
    const terminated = f.lifecycle.terminate();
    f.http.resolve();
    await vi.waitFor(() => expect(f.drainHttp).toHaveBeenCalledOnce());
    expect(f.markNotReady).toHaveBeenCalledOnce();
    expect(f.closeResources).not.toHaveBeenCalled();
    f.work.resolve();
    await terminated;
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("does not close the database before in-flight HTTP writes finish", async () => {
    const f = fixture();
    const terminated = f.lifecycle.terminate();
    f.work.resolve();
    await vi.waitFor(() =>
      expect(f.lifecycle.evaluationState()).toBe("drained"),
    );
    expect(f.closeResources).not.toHaveBeenCalled();
    f.http.resolve();
    await terminated;
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("observes an early HTTP timeout without imposing it on evaluation work", async () => {
    const f = fixture();
    const terminated = f.lifecycle.terminate();
    const rejected = expect(terminated).rejects.toThrow("HTTP timeout");
    f.http.reject(new Error("HTTP timeout"));
    await vi.waitFor(() => expect(f.drainHttp).toHaveBeenCalledOnce());
    expect(f.worker.stop).not.toHaveBeenCalled();
    expect(f.closeResources).not.toHaveBeenCalled();
    f.work.resolve();
    await rejected;
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("preserves dependencies after an ambiguous drain; explicit abort can close later", async () => {
    const f = fixture();
    const terminated = f.lifecycle.terminate();
    f.http.resolve();
    f.work.reject(new Error("Unconfirmed write"));
    await expect(terminated).rejects.toThrow("Unconfirmed write");
    expect(f.lifecycle.evaluationState()).toBe("failed");
    expect(f.closeResources).not.toHaveBeenCalled();
    const aborted = f.lifecycle.abort();
    f.abort.resolve();
    await aborted;
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("handles repeated real signals and never escalates SIGTERM into abort", async () => {
    const f = fixture();
    const signals = new EventEmitter();
    const failed = vi.fn();
    registerApiSignals(signals, f.lifecycle, failed);
    signals.emit("SIGUSR2");
    signals.emit("SIGUSR2");
    expect(f.markNotReady).not.toHaveBeenCalled();
    signals.emit("SIGTERM");
    signals.emit("SIGTERM");
    expect(f.worker.drain).toHaveBeenCalledOnce();
    expect(f.worker.stop).not.toHaveBeenCalled();
    f.work.resolve();
    f.http.resolve();
    await f.lifecycle.terminate();
    expect(f.closeResources).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });
  it("waits for explicit abort even when termination races with it", async () => {
    const f = fixture();
    const aborted = f.lifecycle.abort();
    const terminated = f.lifecycle.terminate();
    f.http.resolve();
    f.work.resolve();
    await vi.waitFor(() => expect(f.drainHttp).toHaveBeenCalledOnce());
    expect(f.closeResources).not.toHaveBeenCalled();
    f.abort.resolve();
    await Promise.all([terminated, aborted]);
    expect(f.worker.drain).not.toHaveBeenCalled();
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("waits for abort cleanup when abort escalates an existing drain", async () => {
    const f = fixture();
    const terminated = f.lifecycle.terminate();
    const aborted = f.lifecycle.abort();
    f.http.resolve();
    f.work.resolve();
    await vi.waitFor(() => expect(f.drainHttp).toHaveBeenCalledOnce());
    expect(f.closeResources).not.toHaveBeenCalled();
    f.abort.resolve();
    await Promise.all([terminated, aborted]);
    expect(f.lifecycle.evaluationState()).toBe("aborted");
    expect(f.closeResources).toHaveBeenCalledOnce();
  });
  it("also retires an API that has no embedded worker", async () => {
    const closeResources = vi.fn(async () => {});
    const lifecycle = createApiLifecycle({
      markNotReady: vi.fn(),
      drainHttp: async () => {},
      closeResources,
      onEvaluationState() {
        throw new Error("Optional logger failed");
      },
    });
    await lifecycle.terminate();
    expect(closeResources).toHaveBeenCalledOnce();
  });
});
