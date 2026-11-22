"use client";
import type { ScoreField } from "@kortyx/telemetry-contracts";
import { ChevronDown, Plus, Settings2, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorSelect } from "./editor-fields";
import { ScoreFieldEvidenceSummary } from "./score-field-example";
import {
  FIELD_TYPES,
  type FieldKind,
  fieldKind,
  makeScoreField,
} from "./score-field-type";

function PolicySwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3"
    >
      <span className="flex flex-col gap-1">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[11px] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  );
}
export function ScoreFieldEditor({
  field,
  requiredAssessment: assessment,
  disabled,
  focusNew,
  onChange,
}: {
  field: ScoreField;
  requiredAssessment: boolean;
  disabled: boolean;
  focusNew: boolean;
  onChange: (field: ScoreField) => void;
}) {
  const prefix = `score-field-${useId()}`;
  const nameInput = useRef<HTMLInputElement>(null);
  const [previousCategories, setPreviousCategories] = useState<
    Extract<ScoreField, { type: "category" }>["options"] | null
  >(null);
  useEffect(() => {
    if (!focusNew || disabled || !window.matchMedia("(pointer: fine)").matches)
      return;
    const frame = requestAnimationFrame(() => {
      nameInput.current?.focus();
      nameInput.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusNew, disabled]);
  const update = (patch: Partial<ScoreField>) => {
    setPreviousCategories(null);
    onChange({ ...field, ...patch } as ScoreField);
  };
  return (
    <div
      className="@container/field-settings flex flex-col gap-6"
      data-score-field-form
    >
      <div className="grid items-start gap-4 @sm/field-settings:grid-cols-[minmax(0,1fr)_10rem]">
        <EditorField id={`${prefix}-label`} label="Field name">
          <Input
            ref={nameInput}
            id={`${prefix}-label`}
            name="fieldName"
            autoComplete="off"
            value={field.label}
            maxLength={200}
            disabled={disabled}
            aria-invalid={!field.label.trim()}
            onChange={(event) => update({ label: event.target.value })}
          />
        </EditorField>
        <EditorSelect
          id={`${prefix}-type`}
          label="Type"
          value={fieldKind(field)}
          disabled={disabled || assessment}
          options={Object.entries(FIELD_TYPES).map(([value, type]) => ({
            value,
            label: type.label,
          }))}
          onChange={(kind) => {
            setPreviousCategories(null);
            onChange({
              ...makeScoreField(kind as FieldKind, field.id),
              label: field.label,
              description: field.description,
              allowInsufficientEvidence: field.allowInsufficientEvidence,
              allowNotApplicable: field.allowNotApplicable,
            });
          }}
        />
      </div>
      <EditorField
        id={`${prefix}-guidance`}
        label="Grading guidance"
        description={
          field.type === "number" && field.preset === "score"
            ? "Describe what 0, intermediate values and 1 mean."
            : "Tell the judge what to look for and how to assign this value."
        }
      >
        <Textarea
          id={`${prefix}-guidance`}
          name="gradingGuidance"
          autoComplete="off"
          rows={4}
          maxLength={4000}
          value={field.description}
          disabled={disabled}
          aria-describedby={`${prefix}-guidance-description`}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="e.g. Base the assessment on the recorded evidence…"
          className="min-h-28 resize-y leading-6"
        />
      </EditorField>
      {field.type === "number" && (
        <section className="flex flex-col gap-3" aria-label="Number scale">
          <h3 className="text-xs font-medium">Scale</h3>
          {field.preset === "score" ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/25 p-3">
              <span className="rounded-md border bg-background px-3 py-1 font-mono text-xs">
                0–1
              </span>
              <div className="text-[11px] leading-5 text-muted-foreground">
                Continuous score
                <span className="block">
                  Decimals allowed. Define its meaning in the guidance.
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <EditorField id={`${prefix}-min`} label="Minimum">
                <Input
                  id={`${prefix}-min`}
                  name="minimum"
                  type="number"
                  step={field.integer ? 1 : "any"}
                  value={field.min}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ min: Number(event.target.value) })
                  }
                />
              </EditorField>
              <EditorField id={`${prefix}-max`} label="Maximum">
                <Input
                  id={`${prefix}-max`}
                  name="maximum"
                  type="number"
                  step={field.integer ? 1 : "any"}
                  value={field.max}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ max: Number(event.target.value) })
                  }
                />
              </EditorField>
            </div>
          )}
          <EditorSelect
            id={`${prefix}-direction`}
            label="Better values"
            value={field.direction}
            disabled={disabled}
            options={[
              { value: "higher", label: "Higher is better" },
              { value: "lower", label: "Lower is better" },
              { value: "none", label: "No quality ordering" },
            ]}
            onChange={(direction) =>
              update({ direction: direction as "higher" | "lower" | "none" })
            }
          />
          {field.preset === "custom" && (
            <div className="rounded-lg border">
              <PolicySwitch
                id={`${prefix}-integer`}
                label="Whole numbers only"
                description="Use this for counts and discrete measurements."
                checked={field.integer}
                disabled={disabled}
                onChange={(integer) => update({ integer })}
              />
            </div>
          )}
        </section>
      )}
      {field.type === "category" && (
        <section className="flex flex-col gap-3" aria-label="Category options">
          <h3 className="text-xs font-medium">
            Categories{" "}
            <span className="ml-1 text-muted-foreground">
              {field.options.length}
            </span>
          </h3>
          <div className="rounded-lg border">
            <PolicySwitch
              id={`${prefix}-multiple`}
              label="Allow multiple categories"
              description="Return all matching categories, or none."
              checked={field.multiple}
              disabled={disabled}
              onChange={(multiple) => update({ multiple })}
            />
          </div>
          <div className="flex flex-col gap-3">
            {field.options.map((option, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: Controlled rows have editable keys and no local state.
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border bg-muted/15 p-3 @sm/field-settings:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_auto]"
              >
                <label
                  htmlFor={`${prefix}-category-name-${index}`}
                  className="flex flex-col gap-2 text-[11px]"
                >
                  <span className="text-muted-foreground">Name</span>
                  <Input
                    id={`${prefix}-category-name-${index}`}
                    value={option.label}
                    maxLength={200}
                    autoComplete="off"
                    aria-label={`Category ${index + 1} name`}
                    disabled={disabled}
                    placeholder="Category name…"
                    onChange={(event) =>
                      update({
                        options: field.options.map((item, position) =>
                          position === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label
                  htmlFor={`${prefix}-category-meaning-${index}`}
                  className="col-span-2 row-start-2 flex flex-col gap-2 text-[11px] @sm/field-settings:col-span-1 @sm/field-settings:row-start-auto"
                >
                  <span className="text-muted-foreground">Meaning</span>
                  <Input
                    id={`${prefix}-category-meaning-${index}`}
                    value={option.description}
                    maxLength={2000}
                    autoComplete="off"
                    aria-label={`Category ${index + 1} meaning`}
                    disabled={disabled}
                    placeholder="When should it apply?…"
                    onChange={(event) =>
                      update({
                        options: field.options.map((item, position) =>
                          position === index
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="col-start-2 row-start-1 mt-6 @sm/field-settings:col-start-3"
                  aria-label={`Remove category ${option.label}`}
                  disabled={disabled || field.options.length <= 2}
                  onClick={() => {
                    update({
                      options: field.options.filter(
                        (_, position) => position !== index,
                      ),
                    });
                    setPreviousCategories(field.options);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={disabled || field.options.length >= 50}
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
            <Plus data-icon="inline-start" />
            Add category
          </Button>
          {previousCategories && (
            <output className="flex items-center gap-2 text-xs text-muted-foreground">
              Category removed.
              <Button
                size="sm"
                variant="link"
                onClick={() => update({ options: previousCategories })}
              >
                Undo
              </Button>
            </output>
          )}
        </section>
      )}
      {!assessment ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-xs font-medium">
            When a value cannot be assigned
          </legend>
          <div className="divide-y rounded-lg border">
            <PolicySwitch
              id={`${prefix}-insufficient`}
              label="Insufficient evidence"
              description="Allow the judge to explain what evidence is missing."
              checked={field.allowInsufficientEvidence}
              disabled={disabled}
              onChange={(allowInsufficientEvidence) =>
                update({ allowInsufficientEvidence })
              }
            />
            <PolicySwitch
              id={`${prefix}-not-applicable`}
              label="Not applicable"
              description="Allow the judge to explain why this field does not apply."
              checked={field.allowNotApplicable}
              disabled={disabled}
              onChange={(allowNotApplicable) => update({ allowNotApplicable })}
            />
          </div>
        </fieldset>
      ) : (
        <ScoreFieldEvidenceSummary field={field} />
      )}
      <details className="group rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <Settings2
            className="size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          Advanced
          <ChevronDown
            className="ml-auto size-3.5 text-muted-foreground group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="flex flex-col gap-4 border-t p-4">
          <EditorField
            id={`${prefix}-key`}
            label="Field key"
            description={
              !assessment && field.id === "assessment"
                ? "Assessment is reserved. Choose another field key."
                : "Stable key in judge results. Changing it creates a different output field."
            }
          >
            <Input
              id={`${prefix}-key`}
              name="fieldKey"
              aria-invalid={
                !/^[a-z][a-z0-9_]{0,63}$/.test(field.id) ||
                (!assessment && field.id === "assessment")
              }
              autoComplete="off"
              spellCheck={false}
              value={field.id}
              maxLength={64}
              disabled={disabled || assessment}
              onChange={(event) => update({ id: event.target.value })}
              className="font-mono text-xs"
            />
          </EditorField>
          {field.type === "text" && (
            <div className="grid grid-cols-2 gap-3">
              <EditorField
                id={`${prefix}-min-length`}
                label="Minimum characters"
              >
                <Input
                  id={`${prefix}-min-length`}
                  type="number"
                  min={1}
                  max={16000}
                  value={field.minLength}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ minLength: Number(event.target.value) })
                  }
                />
              </EditorField>
              <EditorField
                id={`${prefix}-max-length`}
                label="Maximum characters"
              >
                <Input
                  id={`${prefix}-max-length`}
                  type="number"
                  min={1}
                  max={16000}
                  value={field.maxLength}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ maxLength: Number(event.target.value) })
                  }
                />
              </EditorField>
            </div>
          )}
          {field.type === "category" && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] leading-5 text-muted-foreground">
                Category keys are the values returned in structured results.
              </p>
              {field.options.map((option, index) => (
                <EditorField
                  // biome-ignore lint/suspicious/noArrayIndexKey: Category keys are editable controlled values.
                  key={index}
                  id={`${prefix}-category-key-${index}`}
                  label={`${option.label || `Category ${index + 1}`} key`}
                >
                  <Input
                    id={`${prefix}-category-key-${index}`}
                    value={option.id}
                    maxLength={64}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    className="font-mono text-xs"
                    onChange={(event) =>
                      update({
                        options: field.options.map((item, position) =>
                          position === index
                            ? { ...item, id: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </EditorField>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
