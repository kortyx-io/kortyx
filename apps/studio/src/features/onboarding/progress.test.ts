import { describe, expect, it } from "vitest";
import {
  chapterStatus,
  checkpoint,
  emptyProgress,
  entryIntent,
  finishChapter,
  LEGACY_KEY,
  nextChapter,
  normalizeProgress,
  PROGRESS_KEY,
  previousChapter,
  readProgress,
  reviewChapter,
  startChapter,
  writeProgress,
} from "./progress";
import { CHAPTERS, FULL_TOUR } from "./registry";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("learning progress", () => {
  it("migrates the quick tour without launching a tour or marking skips complete", () => {
    for (const outcome of ["completed", "skipped"]) {
      const local = storage();
      local.setItem(LEGACY_KEY, outcome);
      const progress = readProgress(local);
      expect(progress.chapters["sample-execution"]?.status).toBe(outcome);
      expect(progress.resume).toBeNull();
      expect(chapterStatus(progress, "debug-execution")).toBe("Not started");
    }
  });
  it("reset stays reset even when the old quick-tour preference remains", () => {
    const local = storage();
    local.setItem(LEGACY_KEY, "completed");
    writeProgress(emptyProgress(), local);
    expect(readProgress(local)).toEqual(emptyProgress());
  });
  it("persists a real checkpoint, resumes it and keeps other chapter history", () => {
    const local = storage();
    const completed = finishChapter(
      startChapter(emptyProgress(), "sample-execution", "chapter"),
      "completed",
    );
    const progress = checkpoint(
      startChapter(completed, "debug-execution", "chapter"),
      "failure-trace",
    );
    expect(writeProgress(progress, local)).toBe(true);
    expect(readProgress(local).resume).toMatchObject({
      chapter: "debug-execution",
      step: "failure-trace",
      mode: "chapter",
      phase: "step",
    });
    expect(chapterStatus(readProgress(local), "sample-execution")).toBe(
      "Completed",
    );
  });
  it("finishes the full queue with honest completion and skip totals", () => {
    let progress = startChapter(
      emptyProgress(),
      FULL_TOUR[0] ?? "sample-execution",
      "full",
    );
    for (const [index, id] of FULL_TOUR.entries()) {
      expect(progress.resume?.chapter).toBe(id);
      progress = finishChapter(progress, index === 2 ? "skipped" : "completed");
      expect(progress.resume?.phase).toBe("break");
      expect(progress.resume?.completed).toHaveLength(
        index === 2 ? 2 : index > 2 ? index : index + 1,
      );
      const normalized = normalizeProgress(
        JSON.parse(JSON.stringify(progress)),
      );
      expect(normalized.resume).toEqual(progress.resume);
      if (index === FULL_TOUR.length - 1) {
        expect(progress.resume?.completed).toHaveLength(5);
        expect(progress.resume?.skipped).toEqual(["conversation"]);
      }
      progress = nextChapter(progress);
    }
    expect(progress.resume).toBeNull();
    expect(chapterStatus(progress, "conversation")).toBe("Skipped");
    expect(progress.chapters.personalize).toBeUndefined();
  });
  it("can review the previous chapter without counting it twice", () => {
    let progress = finishChapter(
      startChapter(emptyProgress(), "sample-execution", "full"),
      "completed",
    );
    progress = previousChapter(nextChapter(progress));
    expect(progress.resume?.chapter).toBe("sample-execution");
    expect(progress.resume?.step).toBe("execution-details");
    progress = checkpoint(progress, "execution-details");
    expect(chapterStatus(progress, "sample-execution")).toBe("Completed");
    progress = finishChapter(progress, "completed");
    expect(progress.resume?.completed).toEqual(["sample-execution"]);
    expect(reviewChapter(progress).resume?.phase).toBe("step");
  });
  it("does not count a skipped chapter as completed and permits replay", () => {
    let progress = finishChapter(
      startChapter(emptyProgress(), "approvals", "chapter"),
      "skipped",
    );
    expect(chapterStatus(progress, "approvals")).toBe("Skipped");
    progress = finishChapter(
      startChapter(progress, "approvals", "chapter"),
      "completed",
    );
    expect(chapterStatus(progress, "approvals")).toBe("Completed");
    expect(progress.resume?.skipped).toEqual([]);
  });
  it("falls back from stale steps and versions while preserving completion history", () => {
    const progress = startChapter(
      emptyProgress(),
      "prompt-versions",
      "chapter",
    );
    progress.chapters["prompt-versions"] = {
      version: 99,
      status: "completed",
      step: "removed-step",
    };
    if (progress.resume) progress.resume.step = "removed-step";
    const restored = normalizeProgress(progress);
    expect(chapterStatus(restored, "prompt-versions")).toBe("Updated guide");
    expect(restored.resume?.step).toBe("prompt-original");
    expect(restored.chapters["prompt-versions"]?.status).toBe("completed");
  });
  it("survives storage denial, corrupt JSON and oversized input", () => {
    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(readProgress(blocked)).toEqual(emptyProgress());
    expect(writeProgress(emptyProgress(), blocked)).toBe(false);
    const local = storage();
    for (const text of ["{", "x".repeat(16_385), '{"schemaVersion": 4}']) {
      local.setItem(PROGRESS_KEY, text);
      expect(readProgress(local)).toEqual(emptyProgress());
    }
  });
  it("preserves newer optional chapter history when an older Studio reads it", () => {
    const future = {
      ...emptyProgress(),
      chapters: {
        "future-guide": {
          version: 1,
          status: "completed",
          step: "future-step",
        },
        "sample-execution": {
          version: 1,
          status: "completed",
          step: "execution-details",
        },
      },
      resume: {
        mode: "chapter",
        chapter: "future-guide",
        step: "future-step",
        phase: "step",
        completed: [],
        skipped: [],
      },
    };
    const restored = normalizeProgress(future);
    expect(restored.chapters["future-guide"]?.status).toBe("completed");
    expect(chapterStatus(restored, "sample-execution")).toBe("Completed");
    expect(restored.resume).toBeNull();
  });
  it("ignores checkpoints that are not part of the active chapter", () => {
    const progress = startChapter(
      emptyProgress(),
      "sample-execution",
      "chapter",
    );
    expect(checkpoint(progress, "failure-trace")).toBe(progress);
    expect(checkpoint(progress, "/customer/private-path")).toBe(progress);
  });
  it("accepts only finite launch intents without accepting arbitrary routes", () => {
    expect(entryIntent("?learn=full")).toEqual({
      action: "full",
      chapter: "sample-execution",
    });
    expect(entryIntent("?learn=chapter&chapter=approvals")).toEqual({
      action: "chapter",
      chapter: "approvals",
    });
    expect(entryIntent("?learn=chapter&chapter=customer-run")).toBeNull();
    expect(entryIntent("?learn=javascript:alert(1)")).toBeNull();
    expect(entryIntent("?resume=true")).toBeNull();
  });
  it("the full tour includes every core chapter and leaves personalization optional", () => {
    expect(FULL_TOUR).toEqual([
      "sample-execution",
      "debug-execution",
      "conversation",
      "approvals",
      "prompt-versions",
      "evaluation-results",
    ]);
    expect(
      CHAPTERS.find((chapter) => chapter.id === "personalize")?.fullTour,
    ).toBe(false);
  });
});

it("queues new or previously unvisited core chapters before calling a resumed full tour finished", () => {
  const progress = startChapter(emptyProgress(), "evaluation-results", "full");
  const finished = finishChapter(progress, "completed");
  expect(nextChapter(finished).resume?.chapter).toBe("sample-execution");
});
