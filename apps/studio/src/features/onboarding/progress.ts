import { SAMPLE_PROJECT as sample } from "@kortyx/telemetry-contracts";
import { z } from "zod";
import {
  CHAPTERS,
  type ChapterId,
  chapterById,
  FULL_TOUR,
  isChapterId,
  type TourMode,
} from "./registry";

export const PROGRESS_KEY = "kortyx.studio.learning.v1";
export const LEGACY_KEY = "kortyx.studio.tour.sample-execution.v1";
const ChapterIdSchema = z.enum(CHAPTERS.map((chapter) => chapter.id));
const ChapterProgressSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["in-progress", "completed", "skipped"]),
  step: z.string().max(80),
});
const ResumeSchema = z.object({
  mode: z.enum(["chapter", "full"]),
  chapter: ChapterIdSchema,
  step: z.string().max(80),
  phase: z.enum(["step", "break"]),
  completed: z.array(ChapterIdSchema).max(CHAPTERS.length),
  skipped: z.array(ChapterIdSchema).max(CHAPTERS.length),
});
export const ProgressSchema = z.object({
  schemaVersion: z.literal(1),
  chapters: z
    .record(z.string().regex(/^[a-z0-9-]{1,64}$/), ChapterProgressSchema)
    .refine((value) => Object.keys(value).length <= 32),
  resume: ResumeSchema.nullable().catch(null),
});
export type LearningProgress = z.infer<typeof ProgressSchema>;
export type ResumePoint = NonNullable<LearningProgress["resume"]>;
export type ChapterOutcome = "completed" | "skipped";
export const emptyProgress = (): LearningProgress => ({
  schemaVersion: 1,
  chapters: {},
  resume: null,
});

/** Unknown/stale steps restart at the nearest safe boundary, never at an arbitrary URL. */
export function normalizeProgress(input: unknown): LearningProgress {
  const parsed = ProgressSchema.safeParse(input);
  if (!parsed.success) return emptyProgress();
  const progress = parsed.data;
  for (const chapter of CHAPTERS) {
    const saved = progress.chapters[chapter.id];
    if (!saved) continue;
    if (
      !chapter.steps.some((step) => step.id === saved.step) ||
      saved.version !== chapter.version
    ) {
      // Preserve older completion as history; a changed version is offered as an updated guide.
      saved.step = chapter.steps[0].id;
    }
  }
  const resume = progress.resume;
  if (resume) {
    const chapter = chapterById(resume.chapter);
    const saved = progress.chapters[chapter.id];
    if (resume.mode === "full" && !FULL_TOUR.includes(resume.chapter))
      progress.resume = null;
    else if (
      !chapter.steps.some((step) => step.id === resume.step) ||
      saved?.version !== chapter.version
    ) {
      resume.step = chapter.steps[0].id;
      resume.phase = "step";
    }
    resume.completed = [...new Set(resume.completed)].filter((id) =>
      FULL_TOUR.includes(id),
    );
    resume.skipped = [...new Set(resume.skipped)].filter(
      (id) => !resume.completed.includes(id) && FULL_TOUR.includes(id),
    );
  }
  return progress;
}

export function readProgress(
  storage: Pick<Storage, "getItem"> | undefined,
): LearningProgress {
  try {
    const text = storage?.getItem(PROGRESS_KEY);
    if (text !== null && text !== undefined)
      return text.length <= 16_384
        ? normalizeProgress(JSON.parse(text))
        : emptyProgress();
    const legacy = storage?.getItem(LEGACY_KEY);
    if (legacy === "completed" || legacy === "skipped")
      return {
        ...emptyProgress(),
        chapters: {
          "sample-execution": {
            version: 1,
            status: legacy,
            step: CHAPTERS[0].steps[2].id,
          },
        },
      };
  } catch {
    /* Private browsing and corrupt preferences never block learning. */
  }
  return emptyProgress();
}
export function writeProgress(
  progress: LearningProgress,
  storage: Pick<Storage, "setItem"> | undefined,
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function startChapter(
  progress: LearningProgress,
  chapter: ChapterId,
  mode: TourMode,
): LearningProgress {
  const definition = chapterById(chapter);
  const step = definition.steps[0].id;
  return {
    ...progress,
    chapters: {
      ...progress.chapters,
      [chapter]: { version: definition.version, status: "in-progress", step },
    },
    resume: { mode, chapter, step, phase: "step", completed: [], skipped: [] },
  };
}
export function checkpoint(
  progress: LearningProgress,
  step: string,
): LearningProgress {
  const resume = progress.resume;
  if (
    !resume ||
    !chapterById(resume.chapter).steps.some((item) => item.id === step)
  )
    return progress;
  const chapter = chapterById(resume.chapter);
  return {
    ...progress,
    chapters: {
      ...progress.chapters,
      [chapter.id]: {
        version: chapter.version,
        status:
          progress.chapters[chapter.id]?.version === chapter.version &&
          progress.chapters[chapter.id]?.status === "completed"
            ? "completed"
            : "in-progress",
        step,
      },
    },
    resume: { ...resume, step, phase: "step" },
  };
}
export function finishChapter(
  progress: LearningProgress,
  outcome: ChapterOutcome,
): LearningProgress {
  const resume = progress.resume;
  if (!resume) return progress;
  const chapter = chapterById(resume.chapter);
  const completed = resume.completed.filter((id) => id !== chapter.id);
  const skipped = resume.skipped.filter((id) => id !== chapter.id);
  (outcome === "completed" ? completed : skipped).push(chapter.id);
  return {
    ...progress,
    chapters: {
      ...progress.chapters,
      [chapter.id]: {
        version: chapter.version,
        status: outcome,
        step: resume.step,
      },
    },
    resume: { ...resume, phase: "break", completed, skipped },
  };
}
export function nextChapter(progress: LearningProgress): LearningProgress {
  const resume = progress.resume;
  if (!resume || resume.mode !== "full") return { ...progress, resume: null };
  const index = FULL_TOUR.indexOf(resume.chapter);
  const visited = new Set([...resume.completed, ...resume.skipped]);
  // A new core chapter inserted before a saved checkpoint still joins the queue.
  const id =
    FULL_TOUR.slice(index + 1).find((chapter) => !visited.has(chapter)) ??
    FULL_TOUR.find((chapter) => !visited.has(chapter));
  if (!id) return { ...progress, resume: null };
  const next = startChapter(progress, id, "full");
  if (next.resume) {
    next.resume.completed = resume.completed;
    next.resume.skipped = resume.skipped;
  }
  return next;
}
export function reviewChapter(progress: LearningProgress): LearningProgress {
  const resume = progress.resume;
  if (!resume) return progress;
  return { ...progress, resume: { ...resume, phase: "step" } };
}
export function previousChapter(progress: LearningProgress): LearningProgress {
  const resume = progress.resume;
  if (!resume || resume.mode !== "full") return progress;
  const index = FULL_TOUR.indexOf(resume.chapter);
  const previous = FULL_TOUR[index - 1];
  if (!previous) return progress;
  const chapter = chapterById(previous);
  return {
    ...progress,
    resume: {
      ...resume,
      chapter: previous,
      step: chapter.steps[chapter.steps.length - 1]?.id ?? chapter.steps[0].id,
      phase: "step",
    },
  };
}

export function chapterStatus(progress: LearningProgress, id: ChapterId) {
  const saved = progress.chapters[id];
  return !saved
    ? "Not started"
    : saved.version !== chapterById(id).version
      ? "Updated guide"
      : saved.status === "completed"
        ? "Completed"
        : saved.status === "skipped"
          ? "Skipped"
          : "In progress";
}
/** Entry intents contain finite IDs only, never user-supplied destinations. */
export function entryIntent(
  search: string,
): { action: "full" | "resume" | "chapter"; chapter: ChapterId } | null {
  const params = new URLSearchParams(search);
  const action = params.get("learn");
  const id = params.get("chapter");
  if (action === "full" || action === "resume")
    return { action, chapter: CHAPTERS[0].id };
  return action === "chapter" && isChapterId(id)
    ? { action, chapter: id }
    : null;
}
export function contextChapter(path: string): ChapterId | null {
  if (path.startsWith("/diagnostics")) return "error-diagnostics";
  if (path.startsWith("/runs")) return "debug-execution";
  if (path.startsWith("/sessions") || path.startsWith("/workflows"))
    return "conversation";
  if (path.startsWith("/interrupts")) return "approvals";
  if (path.startsWith("/prompts")) return "prompt-versions";
  if (
    path.startsWith(`/evals/evaluations/${sample.evaluationIds.candidate}`) ||
    path.startsWith(`/evals/runs/${sample.candidateEvalRunId}`) ||
    path.startsWith(`/evals/cases/${sample.candidateEvalRunId}/`)
  )
    return "evaluation-progress";
  if (path.startsWith("/evals")) return "evaluation-results";
  if (path.startsWith("/settings")) return "personalize";
  return null;
}
