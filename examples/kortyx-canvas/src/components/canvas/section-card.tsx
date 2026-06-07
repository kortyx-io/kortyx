"use client";

import { ListChecks, Trash2 } from "lucide-react";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import type { Item, Section } from "@/schemas/discovery-canvas";
import { EditableText } from "./editable-text";
import { RationaleHint } from "./rationale-hint";

/**
 * Streaming-tolerant partial shapes. While the LLM is still writing, a
 * section can exist with only `section_label` set, or with `items`
 * not yet populated. All field accesses default-coalesce so partial cards
 * still render gracefully.
 */
type PartialItem = Partial<Item>;
type PartialSection = Omit<Partial<Section>, "items"> & {
  items?: Record<string, PartialItem>;
};

type Props = {
  index: number;
  sectionKey: string;
  section: PartialSection;
};

export function SectionCard({ index, sectionKey, section }: Props) {
  const { updateSection, updateItem, removeSection, removeItem } =
    useDiscoveryCanvasStore();
  const itemEntries = Object.entries(section.items ?? {});

  const label = section.section_label ?? "";
  const explanation = section.section_summary ?? "";
  const rationale = section.section_rationale ?? "";
  const sectionType = section.section_type?.replaceAll("_", " ") ?? "discovery";
  const sectionTargetLabel = label ? `section "${label}"` : "this section";

  return (
    <article
      aria-label={`Section ${label}`}
      className="relative rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
          {index + 1}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <EditableText
            value={label}
            onCommit={(section_label) =>
              updateSection(sectionKey, { section_label })
            }
            variant="title"
            ariaLabel="section label"
          />
          <EditableText
            value={explanation}
            onCommit={(section_summary) =>
              updateSection(sectionKey, { section_summary })
            }
            variant="small"
            multiline
            placeholder="Add an explanation"
            ariaLabel="section summary"
          />
          <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            {sectionType}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RationaleHint
            label="Why this matters"
            value={rationale}
            onCommit={(section_rationale) =>
              updateSection(sectionKey, { section_rationale })
            }
            ariaLabel="section rationale"
          />
          <button
            type="button"
            aria-label={`Delete ${sectionTargetLabel}`}
            title={`Delete ${sectionTargetLabel}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => removeSection(sectionKey)}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5" />
          Items ({itemEntries.length})
        </div>
        <ul className="flex flex-col gap-3">
          {itemEntries.map(([itemKey, item], qIndex) => {
            const itemText = item.item_text ?? "";
            return (
              <li
                key={itemKey}
                className="relative rounded-lg border border-border/70 bg-background px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="inline-flex size-4 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                      {qIndex + 1}
                    </span>
                    Item
                  </div>
                  <div className="flex items-center gap-1">
                    <RationaleHint
                      label="Rationale"
                      value={item.item_rationale ?? ""}
                      onCommit={(item_rationale) =>
                        updateItem(sectionKey, itemKey, {
                          item_rationale,
                        })
                      }
                      ariaLabel={`item ${qIndex + 1} rationale`}
                    />
                    <button
                      type="button"
                      aria-label={`Delete item ${qIndex + 1}`}
                      title={`Delete item ${qIndex + 1}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeItem(sectionKey, itemKey)}
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <EditableText
                  value={itemText}
                  onCommit={(item_text) =>
                    updateItem(sectionKey, itemKey, { item_text })
                  }
                  variant="body"
                  multiline
                  ariaLabel={`item ${qIndex + 1} text`}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
