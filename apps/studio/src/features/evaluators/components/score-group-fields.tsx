"use client";

import type {
  ScoreField,
  ScoreGroupDefinition,
} from "@kortyx/telemetry-contracts";
import { LockKeyhole, Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ScoreFieldEditor } from "./score-field-editor";
import {
  ScoreFieldEvidenceSummary,
  ScoreFieldExample,
} from "./score-field-example";
import {
  FIELD_TYPES,
  type FieldKind,
  fieldKind,
  makeScoreField,
  ScoreFieldMark,
  scoreFieldLabel,
} from "./score-field-type";

export function ScoreGroupFields({
  value,
  editing,
  disabled,
  onChange,
}: {
  value: ScoreGroupDefinition;
  editing: boolean;
  disabled: boolean;
  onChange: (definition: ScoreGroupDefinition) => void;
}) {
  const [active, setActive] = useState(0);
  const [newField, setNewField] = useState<number | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const addedFromMenu = useRef(false);
  const titleId = useId();
  const panelId = useId();
  const index = value.fields[active] ? active : 0;
  const field = value.fields[index];
  if (!field) return null;
  const requiredAssessment =
    field.id === "assessment" &&
    index === value.fields.findIndex((item) => item.id === "assessment");
  const kind = fieldKind(field);
  const type = FIELD_TYPES[kind];
  const choose = (index: number) => {
    setActive(index);
    setNewField(null);
  };
  const add = (kind: FieldKind) => {
    addedFromMenu.current = true;
    const base = kind === "custom" ? "number" : kind;
    let id = base,
      suffix = 1;
    while (value.fields.some((field) => field.id === id))
      id = `${base}_${++suffix}`;
    const next = makeScoreField(kind, id);
    if (suffix > 1) next.label = `${next.label} ${suffix}`;
    onChange({ ...value, fields: [...value.fields, next] });
    setActive(value.fields.length);
    setNewField(value.fields.length);
  };
  const choices = value.fields.map((field, index) => ({
    index,
    label: field.label || "Unnamed field",
    kind: fieldKind(field),
  }));
  return (
    <div
      className="@container/score-fields flex h-full min-h-0 flex-col bg-muted/15"
      data-score-group-fields
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Output fields</h2>
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {editing ? `${value.fields.length}/20` : value.fields.length}
          </Badge>
        </div>
        {editing && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || value.fields.length >= 20}
              >
                <Plus data-icon="inline-start" />
                Add field
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-72"
              onCloseAutoFocus={(event) => {
                if (addedFromMenu.current) event.preventDefault();
                addedFromMenu.current = false;
              }}
            >
              <DropdownMenuGroup>
                {(
                  Object.entries(FIELD_TYPES) as [
                    FieldKind,
                    (typeof FIELD_TYPES)[FieldKind],
                  ][]
                ).map(([kind, type]) => (
                  <DropdownMenuItem
                    key={kind}
                    className="items-start gap-3 py-2.5"
                    onSelect={() => add(kind)}
                  >
                    <ScoreFieldMark kind={kind} small />
                    <span className="flex flex-col gap-1">
                      <span className="text-xs font-medium">
                        {type.label}{" "}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {type.detail}
                        </span>
                      </span>
                      <span className="text-[11px] leading-4 text-muted-foreground">
                        {type.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-background @[780px]/score-fields:flex">
          <ScrollArea className="min-h-0 flex-1">
            <nav aria-label="Output fields" className="flex flex-col gap-1 p-3">
              {value.fields.map((item, position) => (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: Field keys are editable and these navigation rows have no local state.
                  key={position}
                  type="button"
                  aria-current={position === index ? "true" : undefined}
                  aria-controls={panelId}
                  onClick={() => choose(position)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left outline-none transition-colors hover:bg-muted/65 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    position === index &&
                      "bg-muted ring-1 ring-inset ring-border",
                  )}
                >
                  <ScoreFieldMark kind={fieldKind(item)} small />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="truncate text-xs font-medium"
                        title={item.label}
                      >
                        {item.label || "Unnamed field"}
                      </span>
                      {item.id === "assessment" &&
                        position ===
                          value.fields.findIndex(
                            (item) => item.id === "assessment",
                          ) && (
                          <LockKeyhole
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-label="Required field"
                          />
                        )}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {scoreFieldLabel(item)}
                    </span>
                    {editing && !item.description.trim() && (
                      <span className="text-[10px] text-muted-foreground">
                        Needs grading guidance
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </nav>
          </ScrollArea>
          <p className="border-t px-5 py-3 text-[10px] leading-5 text-muted-foreground">
            Assessment is always included.
            <br />
            Select a field to {editing ? "configure" : "inspect"} it.
          </p>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b bg-background px-5 py-3 @[780px]/score-fields:hidden">
            <Combobox<(typeof choices)[number]>
              items={choices}
              value={choices[index]}
              itemToStringLabel={(item) => item.label}
              isItemEqualToValue={(a, b) => a.index === b.index}
              onValueChange={(item) => {
                if (item) choose(item.index);
              }}
            >
              <ComboboxInput
                aria-label="Select output field"
                autoComplete="off"
                placeholder="Find a field…"
                className="w-full"
              />
              <ComboboxContent>
                <ComboboxEmpty>No matching field.</ComboboxEmpty>
                <ComboboxList aria-label="Output fields">
                  {(item: (typeof choices)[number]) => (
                    <ComboboxItem key={item.index} value={item}>
                      <ScoreFieldMark kind={item.kind} small />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-xs">{item.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {FIELD_TYPES[item.kind].label}
                        </span>
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <ScrollArea
            className="min-h-0 min-w-0 flex-1"
            viewportClassName="overscroll-contain"
          >
            <section
              id={panelId}
              aria-labelledby={titleId}
              className="@container/field-workspace mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 @lg/score-fields:p-7"
              data-score-field-detail
            >
              <div className="flex items-start gap-3">
                <ScoreFieldMark kind={kind} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2
                    id={titleId}
                    className="break-words text-base font-semibold leading-6"
                  >
                    {field.label || "Unnamed field"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", type.background)}
                    >
                      {scoreFieldLabel(field)}
                    </Badge>
                    {requiredAssessment && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <LockKeyhole className="size-3" aria-hidden="true" />
                        Required
                      </span>
                    )}
                  </div>
                </div>
                {editing && !requiredAssessment && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${field.label}`}
                    disabled={disabled}
                    onClick={() => setRemoveOpen(true)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <div className="grid items-start gap-6 @[840px]/field-workspace:grid-cols-[minmax(0,1fr)_16rem]">
                {editing ? (
                  <ScoreFieldEditor
                    key={index}
                    field={field}
                    requiredAssessment={requiredAssessment}
                    disabled={disabled}
                    focusNew={newField === index}
                    onChange={(next) => {
                      setNewField(null);
                      onChange({
                        ...value,
                        fields: value.fields.map((item, position) =>
                          position === index ? next : item,
                        ),
                      });
                    }}
                  />
                ) : (
                  <ScoreFieldDetails field={field} />
                )}
                <aside className="@[840px]/field-workspace:sticky @[840px]/field-workspace:top-5">
                  <ScoreFieldExample field={field} />
                </aside>
              </div>
            </section>
          </ScrollArea>
        </div>
      </div>
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogTitle>Remove field?</DialogTitle>
          <DialogDescription>
            {field.label} will be removed from this draft. Saved versions and
            previous results keep their fields.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRemoveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={disabled}
              onClick={() => {
                onChange({
                  ...value,
                  fields: value.fields.filter(
                    (_, position) => position !== index,
                  ),
                });
                setActive(Math.max(0, index - 1));
                setNewField(null);
                setRemoveOpen(false);
              }}
            >
              Remove field
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ScoreFieldDetails({ field }: { field: ScoreField }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">Grading guidance</h3>
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
          {field.description}
        </p>
      </section>
      {field.type === "category" && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-medium">Categories</h3>
          <div className="divide-y rounded-lg border bg-background">
            {field.options.map((option) => (
              <div key={option.id} className="flex items-start gap-3 p-3">
                <Badge
                  variant="secondary"
                  className="max-w-40 whitespace-normal break-words text-[11px]"
                >
                  {option.label}
                </Badge>
                <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                  {option.description || "No additional guidance."}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      <ScoreFieldEvidenceSummary field={field} />
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t pt-4 text-[11px] text-muted-foreground">
        <div className="flex flex-col gap-1.5">
          <dt>Output key</dt>
          <dd className="font-mono text-foreground" translate="no">
            {field.id}
          </dd>
        </div>
        {field.type === "text" && (
          <div className="flex flex-col gap-1.5">
            <dt>Length</dt>
            <dd>
              {field.minLength}–{field.maxLength} characters
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
