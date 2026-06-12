import type { CurrentDiscoveryCanvasContext } from "@/lib/runtime-context";

/**
 * Canonical serializer for prompting the LLM. Each editable field is
 * rendered as `path :: value` so the model can copy paths verbatim and
 * resolve ordinal references against the insertion order of sections and
 * items.
 *
 * Pure function — no kortyx hooks, no IO, no `server-only`. Safe to import
 * from tests and from any node that needs to inline the current canvas
 * state into a prompt.
 */
export function serializeDiscoveryCanvasForPrompt(
  canvas: CurrentDiscoveryCanvasContext,
): string {
  const lines: string[] = [];

  if (typeof canvas.title === "string") {
    lines.push(`title :: ${canvas.title}`);
  }
  if (canvas.facilitator_style_id !== undefined) {
    lines.push(
      `facilitator_style_id :: ${canvas.facilitator_style_id ?? "(none)"}`,
    );
  }
  if (canvas.canvas_mode) {
    lines.push(`canvas_mode :: ${canvas.canvas_mode}`);
  }

  if (canvas.intro) {
    if (canvas.intro.label) {
      lines.push(`intro.label :: ${canvas.intro.label}`);
    }
    if (canvas.intro.summary) {
      lines.push(`intro.summary :: ${canvas.intro.summary}`);
    }
    if (canvas.intro.item_text) {
      lines.push(`intro.item_text :: ${canvas.intro.item_text}`);
    }
  }

  const entries = Object.entries(canvas.sections ?? {});
  entries.forEach(([sectionKey, section], index) => {
    if (!section) return;
    lines.push("");
    lines.push(
      `# Section ${index + 1} [${sectionKey}] — "${section.section_label}"`,
    );
    lines.push(
      `  sections.${sectionKey}.section_label :: ${section.section_label}`,
    );
    lines.push(
      `  sections.${sectionKey}.section_summary :: ${section.section_summary}`,
    );
    lines.push(
      `  sections.${sectionKey}.section_rationale :: ${section.section_rationale}`,
    );

    const itemEntries = Object.entries(section.items ?? {});
    itemEntries.forEach(([itemKey, item], qIndex) => {
      lines.push(`  ## Item ${qIndex + 1} [${itemKey}]`);
      lines.push(
        `    sections.${sectionKey}.items.${itemKey}.item_text :: ${item.item_text}`,
      );
      lines.push(
        `    sections.${sectionKey}.items.${itemKey}.item_rationale :: ${item.item_rationale}`,
      );
    });
  });

  return lines.join("\n");
}

/**
 * Compact line-oriented serializer used by the general-chat system prompt.
 * Includes labels + item texts but skips paths so the
 * model writes naturally instead of echoing dot notation.
 */
export function formatDiscoveryCanvasForChat(
  canvas: CurrentDiscoveryCanvasContext,
): string {
  const lines: string[] = [];
  if (canvas.title) {
    lines.push(`Title: ${canvas.title}`);
  }
  if (canvas.facilitator_style_id !== undefined) {
    lines.push(
      `Review style: ${canvas.facilitator_style_id ?? "(none selected)"}`,
    );
  }
  if (canvas.canvas_mode) {
    lines.push(`Review channel: ${canvas.canvas_mode}`);
  }
  if (canvas.intro) {
    if (canvas.intro.label) {
      lines.push(`Product brief title: ${canvas.intro.label}`);
    }
    if (canvas.intro.summary) {
      lines.push(`Product brief description: ${canvas.intro.summary}`);
    }
    if (canvas.intro.item_text) {
      lines.push(`Intake item: ${canvas.intro.item_text}`);
    }
  }

  const points = canvas.sections ?? {};
  const entries = Object.entries(points);
  if (entries.length > 0) {
    lines.push("Sections:");
    for (const [sectionKey, section] of entries) {
      lines.push(`  [${sectionKey}] ${section.section_label}`);
      if (section.section_summary) {
        lines.push(`    explanation: ${section.section_summary}`);
      }
      if (section.section_rationale) {
        lines.push(`    rationale: ${section.section_rationale}`);
      }
      const itemEntries = Object.entries(section.items ?? {});
      if (itemEntries.length > 0) {
        lines.push("    items:");
        for (const [itemKey, item] of itemEntries) {
          lines.push(`      [${itemKey}] ${item.item_text}`);
          if (item.item_rationale) {
            lines.push(`        rationale: ${item.item_rationale}`);
          }
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Returns true when the canvas has any user-visible content. Used to gate
 * branches that only make sense once the canvas exists.
 */
export function canvasHasContent(
  canvas: CurrentDiscoveryCanvasContext | undefined,
): canvas is CurrentDiscoveryCanvasContext {
  if (!canvas) return false;
  if (canvas.intro?.item_text) return true;
  return Object.keys(canvas.sections ?? {}).length > 0;
}
