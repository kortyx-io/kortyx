"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { displayName } from "../lib/presentation";

export function EvalSuiteSelection({
  suite,
  selected,
  expanded,
  disabled,
  onExpand,
  onChange,
}: {
  suite: { id: string; name?: string; cases: { id: string; name?: string }[] };
  selected: string[];
  expanded: boolean;
  disabled: boolean;
  onExpand: () => void;
  onChange: (ids: string[]) => void;
}) {
  const contentId = useId();
  const name = suite.name ?? displayName(suite.id);
  const complete =
    selected.length > 0 && selected.length === suite.cases.length;
  const partial = selected.length > 0 && !complete;
  return (
    <fieldset aria-label={name} className="overflow-hidden rounded-md border">
      <legend className="sr-only">{name}</legend>
      <div className="flex items-center gap-3 p-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            aria-label={`Select all conversations in ${name}`}
            aria-checked={partial ? "mixed" : complete}
            className="mt-0.5 accent-foreground"
            checked={complete}
            ref={(input) => {
              if (input) input.indeterminate = partial;
            }}
            disabled={disabled || suite.cases.length === 0}
            onChange={(event) =>
              onChange(
                event.target.checked ? suite.cases.map((item) => item.id) : [],
              )
            }
          />
          <span className="min-w-0">
            <span className="block break-words text-sm">{name}</span>
            <span className="text-xs text-muted-foreground">
              {selected.length} of {suite.cases.length} conversations selected
            </span>
          </span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
          aria-expanded={expanded}
          aria-controls={contentId}
          disabled={disabled}
          onClick={onExpand}
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </Button>
      </div>
      {expanded ? (
        <fieldset
          id={contentId}
          aria-label={`Conversations in ${name}`}
          disabled={disabled}
          className="space-y-3 border-t p-3 pl-10"
        >
          <legend className="sr-only">Conversations in {name}</legend>
          {suite.cases.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-foreground"
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              <span className="break-words">
                {item.name ?? displayName(item.id)}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
