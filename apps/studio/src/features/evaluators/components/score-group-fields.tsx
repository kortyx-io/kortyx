"use client";
import {
  ASSESSMENT_FIELD,
  type ScoreField,
  type ScoreGroupDefinition,
} from "@kortyx/telemetry-contracts";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorSelect } from "./editor-fields";

export const FIELD_KINDS = [
  { value: "score", label: "Score · 0–1" },
  { value: "rating", label: "Rating · 1–5" },
  { value: "custom", label: "Number · custom range" },
  { value: "boolean", label: "Boolean" },
  { value: "category", label: "Category" },
  { value: "text", label: "Text" },
];
export const scoreFieldLabel = (field: ScoreField) =>
  field.type === "number"
    ? `${field.preset === "score" ? "Score" : field.preset === "rating" ? "Rating" : "Number"} · ${field.min}–${field.max}`
    : field.type === "category"
      ? field.multiple
        ? "Category · multiple"
        : "Category"
      : field.type === "boolean"
        ? "Boolean"
        : "Text";
function makeField(kind: string, id: string): ScoreField {
  const common = {
    id,
    label: "New field",
    description: "",
    allowNotApplicable: true,
    allowInsufficientEvidence: true,
  };
  if (kind === "boolean") return { ...common, type: "boolean" };
  if (kind === "text")
    return { ...common, type: "text", minLength: 1, maxLength: 4000 };
  if (kind === "category")
    return {
      ...common,
      type: "category",
      multiple: false,
      options: [
        { id: "option_1", label: "Option 1", description: "" },
        { id: "option_2", label: "Option 2", description: "" },
      ],
    };
  return {
    ...common,
    type: "number",
    preset:
      kind === "score" ? "score" : kind === "rating" ? "rating" : "custom",
    integer: kind === "rating",
    min: kind === "rating" ? 1 : 0,
    max: kind === "score" ? 1 : kind === "rating" ? 5 : 100,
    direction: "higher",
  };
}
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-foreground"
      />
      {label}
    </label>
  );
}
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
  const [kind, setKind] = useState("score");
  return (
    <div className="flex flex-col gap-5 p-4 @lg:p-5" data-score-group-fields>
      {editing ? (
        <div className="grid items-start gap-4 @xl:grid-cols-2">
          <EditorField id="score-group-name" label="Group name">
            <Input
              id="score-group-name"
              value={value.name}
              disabled={disabled}
              maxLength={200}
              onChange={(event) =>
                onChange({ ...value, name: event.target.value })
              }
              placeholder="e.g. Answer quality"
            />
          </EditorField>
          <EditorField id="score-group-description" label="Description">
            <Textarea
              id="score-group-description"
              value={value.description}
              disabled={disabled}
              rows={2}
              maxLength={2000}
              onChange={(event) =>
                onChange({ ...value, description: event.target.value })
              }
              placeholder="When should this group be used?"
            />
          </EditorField>
        </div>
      ) : (
        value.description && (
          <p className="text-xs leading-5 text-muted-foreground">
            {value.description}
          </p>
        )
      )}
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-medium">Output fields</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Assessment is required. Each additional field defines a value and its
          grading guidance; missing evidence can be reported explicitly.
        </p>
      </div>
      <div className="divide-y rounded-md border">
        {value.fields.map((field, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Field keys are editable; removal resets the active editor and rows have no local state.
          <div key={index}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                aria-expanded={active === index}
                onClick={() => setActive(active === index ? -1 : index)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium"
              >
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${active === index ? "" : "-rotate-90"}`}
                />
                <span className="truncate">{field.label || "New field"}</span>
                {field.id === "assessment" && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    Required
                  </span>
                )}
              </button>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {scoreFieldLabel(field)}
              </Badge>
              {editing && field.id !== "assessment" && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${field.label}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange({
                      ...value,
                      fields: value.fields.filter(
                        (_, position) => position !== index,
                      ),
                    });
                    setActive(Math.max(0, index - 1));
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            {active === index &&
              (editing ? (
                <ScoreFieldEditor
                  field={field}
                  index={index}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange({
                      ...value,
                      fields: value.fields.map((item, position) =>
                        position === index ? next : item,
                      ),
                    })
                  }
                />
              ) : (
                <div className="flex flex-col gap-3 px-4 pt-1 pb-4 text-xs">
                  <p className="whitespace-pre-wrap leading-5">
                    {field.description}
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-muted-foreground">
                    <dt>Key</dt>
                    <dd className="font-mono">{field.id}</dd>
                    {field.type === "number" && (
                      <>
                        <dt>Direction</dt>
                        <dd>
                          {field.direction === "higher"
                            ? "Higher is better"
                            : field.direction === "lower"
                              ? "Lower is better"
                              : "No ordering"}
                        </dd>
                      </>
                    )}
                    {field.type === "text" && (
                      <>
                        <dt>Length</dt>
                        <dd>
                          {field.minLength}–{field.maxLength} characters
                        </dd>
                      </>
                    )}
                    <dt>Missing evidence</dt>
                    <dd>
                      {field.allowInsufficientEvidence
                        ? "Can abstain with a reason"
                        : "A value is required"}
                    </dd>
                  </dl>
                  {field.type === "category" && (
                    <ul className="flex flex-col gap-2">
                      {field.options.map((option) => (
                        <li key={option.id}>
                          <span className="font-medium">{option.label}</span>
                          {option.description && ` — ${option.description}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <EditorSelect
              id="new-score-field-type"
              label="New field type"
              value={kind}
              options={FIELD_KINDS}
              disabled={disabled || value.fields.length >= 20}
              onChange={setKind}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || value.fields.length >= 20}
            onClick={() => {
              let n = value.fields.length;
              while (value.fields.some((field) => field.id === `field_${n}`))
                n++;
              onChange({
                ...value,
                fields: [...value.fields, makeField(kind, `field_${n}`)],
              });
              setActive(value.fields.length);
            }}
          >
            <Plus />
            Add field
          </Button>
        </div>
      )}
    </div>
  );
}
function ScoreFieldEditor({
  field,
  index,
  disabled,
  onChange,
}: {
  field: ScoreField;
  index: number;
  disabled: boolean;
  onChange: (field: ScoreField) => void;
}) {
  const prefix = `score-field-${index}`;
  const update = (patch: Partial<ScoreField>) =>
    onChange({ ...field, ...patch } as ScoreField);
  const assessment = field.id === ASSESSMENT_FIELD.id;
  return (
    <div className="flex flex-col gap-4 border-t bg-muted/15 p-4">
      <div className="grid items-start gap-4 @xl:grid-cols-2">
        <EditorField id={`${prefix}-label`} label="Field label">
          <Input
            id={`${prefix}-label`}
            disabled={disabled}
            value={field.label}
            maxLength={200}
            onChange={(event) => update({ label: event.target.value })}
          />
        </EditorField>
        <EditorField
          id={`${prefix}-key`}
          label="Field key"
          description="Stable key used in judge results."
        >
          <Input
            id={`${prefix}-key`}
            disabled={disabled || assessment}
            value={field.id}
            maxLength={64}
            onChange={(event) => update({ id: event.target.value })}
          />
        </EditorField>
        <EditorSelect
          id={`${prefix}-type`}
          label="Type"
          value={field.type === "number" ? field.preset : field.type}
          options={FIELD_KINDS}
          disabled={disabled || assessment}
          onChange={(kind) =>
            onChange({
              ...makeField(kind, field.id),
              label: field.label,
              description: field.description,
            })
          }
        />
      </div>
      <EditorField
        id={`${prefix}-guidance`}
        label="Grading guidance"
        description={
          field.type === "number" && field.preset === "score"
            ? "Define what 0, intermediate values and 1 mean. This is a rubric score, not automatically a probability."
            : "Explain what this field measures and how the judge should assign its value."
        }
      >
        <Textarea
          id={`${prefix}-guidance`}
          disabled={disabled}
          value={field.description}
          maxLength={4000}
          rows={3}
          onChange={(event) => update({ description: event.target.value })}
          placeholder={
            field.type === "boolean"
              ? "What do true and false mean?"
              : "Define the criterion and give examples."
          }
        />
      </EditorField>
      {(field.type === "number" || field.type === "text") && (
        <div className="grid items-start gap-4 @xl:grid-cols-2">
          <EditorField
            id={`${prefix}-min`}
            label={field.type === "text" ? "Minimum characters" : "Minimum"}
          >
            <Input
              id={`${prefix}-min`}
              type="number"
              value={field.type === "text" ? field.minLength : field.min}
              disabled={
                disabled ||
                (field.type === "number" && field.preset === "score")
              }
              onChange={(event) =>
                update(
                  field.type === "text"
                    ? { minLength: Number(event.target.value) }
                    : { min: Number(event.target.value) },
                )
              }
            />
          </EditorField>
          <EditorField
            id={`${prefix}-max`}
            label={field.type === "text" ? "Maximum characters" : "Maximum"}
          >
            <Input
              id={`${prefix}-max`}
              type="number"
              value={field.type === "text" ? field.maxLength : field.max}
              disabled={
                disabled ||
                (field.type === "number" && field.preset === "score")
              }
              onChange={(event) =>
                update(
                  field.type === "text"
                    ? { maxLength: Number(event.target.value) }
                    : { max: Number(event.target.value) },
                )
              }
            />
          </EditorField>
          {field.type === "number" && (
            <EditorSelect
              id={`${prefix}-direction`}
              label="Direction"
              value={field.direction}
              disabled={disabled}
              options={[
                { value: "higher", label: "Higher is better" },
                { value: "lower", label: "Lower is better" },
                { value: "none", label: "No ordering" },
              ]}
              onChange={(direction) =>
                update({ direction: direction as "higher" | "lower" | "none" })
              }
            />
          )}
          {field.type === "number" && field.preset === "custom" && (
            <Toggle
              label="Whole numbers only"
              checked={field.integer}
              disabled={disabled}
              onChange={(integer) => update({ integer })}
            />
          )}
        </div>
      )}
      {field.type === "category" && (
        <div className="flex flex-col gap-3">
          <Toggle
            label="Allow multiple categories"
            checked={field.multiple}
            disabled={disabled}
            onChange={(multiple) => update({ multiple })}
          />
          {field.options.map((option, position) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Category keys are editable and these controlled rows have no local state.
              key={position}
              className="grid items-end gap-3 @xl:grid-cols-[1fr_1fr_auto]"
            >
              <EditorField
                id={`${prefix}-option-${position}-id`}
                label="Category key"
              >
                <Input
                  id={`${prefix}-option-${position}-id`}
                  value={option.id}
                  disabled={disabled}
                  onChange={(event) =>
                    update({
                      options: field.options.map((item, n) =>
                        n === position
                          ? { ...item, id: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </EditorField>
              <EditorField
                id={`${prefix}-option-${position}-label`}
                label="Category label"
              >
                <Input
                  id={`${prefix}-option-${position}-label`}
                  value={option.label}
                  disabled={disabled}
                  onChange={(event) =>
                    update({
                      options: field.options.map((item, n) =>
                        n === position
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </EditorField>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove category ${option.label}`}
                disabled={disabled || field.options.length <= 2}
                onClick={() =>
                  update({
                    options: field.options.filter((_, n) => n !== position),
                  })
                }
              >
                <Trash2 />
              </Button>
              <div className="@xl:col-span-3">
                <EditorField
                  id={`${prefix}-option-${position}-description`}
                  label="Meaning"
                >
                  <Input
                    id={`${prefix}-option-${position}-description`}
                    value={option.description}
                    disabled={disabled}
                    onChange={(event) =>
                      update({
                        options: field.options.map((item, n) =>
                          n === position
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </EditorField>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || field.options.length >= 50}
            className="self-start"
            onClick={() => {
              let n = field.options.length + 1;
              while (
                field.options.some((option) => option.id === `option_${n}`)
              )
                n++;
              update({
                options: [
                  ...field.options,
                  { id: `option_${n}`, label: `Option ${n}`, description: "" },
                ],
              });
            }}
          >
            <Plus />
            Add category
          </Button>
        </div>
      )}
      {!assessment && (
        <div className="flex flex-wrap gap-4">
          <Toggle
            label="Allow insufficient evidence"
            checked={field.allowInsufficientEvidence}
            disabled={disabled}
            onChange={(allowInsufficientEvidence) =>
              update({ allowInsufficientEvidence })
            }
          />
          <Toggle
            label="Allow not applicable"
            checked={field.allowNotApplicable}
            disabled={disabled}
            onChange={(allowNotApplicable) => update({ allowNotApplicable })}
          />
        </div>
      )}
    </div>
  );
}
