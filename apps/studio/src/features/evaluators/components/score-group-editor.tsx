"use client";
import {
  DEFAULT_ASSESSMENT_GROUP,
  type ScoreGroup,
  ScoreGroupDefinitionSchema,
  ScoreGroupSchema,
} from "@kortyx/telemetry-contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { evaluatorRequest } from "../api/client";
import { EditorField, EditorSelect } from "./editor-fields";
export function ScoreGroupEditor({
  onCreated,
  onCancel,
  initialGroup,
}: {
  initialGroup?: ScoreGroup;
  onCreated: (group: ScoreGroup) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialGroup?.name ?? "");
  const [fields, setFields] = useState<ScoreGroup["fields"]>(
    structuredClone(initialGroup?.fields ?? DEFAULT_ASSESSMENT_GROUP.fields),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (index: number, field: ScoreGroup["fields"][number]) =>
    setFields((old) => old.map((f, i) => (i === index ? field : f)));
  return (
    <section aria-label="Score group fields" className="flex flex-col gap-4">
      <EditorField id="group-name" label="Group name">
        <Input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </EditorField>
      {fields.map((field, index) => (
        <fieldset
          key={field.id}
          className="flex flex-col gap-3 rounded-md border p-3"
        >
          <legend className="px-1 text-sm font-medium">
            {index === 0 ? "Assessment · required" : `Field ${index + 1}`}
          </legend>
          {index > 0 && (
            <>
              <EditorField id={`field-${index}-id`} label="Field ID">
                <Input
                  id={`field-${index}-id`}
                  value={field.id}
                  onChange={(e) =>
                    update(index, { ...field, id: e.target.value })
                  }
                />
              </EditorField>
              <EditorField id={`field-${index}-label`} label="Label">
                <Input
                  id={`field-${index}-label`}
                  value={field.label}
                  onChange={(e) =>
                    update(index, { ...field, label: e.target.value })
                  }
                />
              </EditorField>
              <EditorSelect
                id={`field-${index}-type`}
                label="Type"
                value={field.type}
                options={["text", "boolean", "numeric", "categorical"].map(
                  (t) => ({ value: t, label: t }),
                )}
                onChange={(type) => {
                  const base = {
                    id: field.id,
                    label: field.label,
                    description: field.description,
                    abstain: field.abstain,
                  };
                  if (type === "numeric")
                    update(index, {
                      ...base,
                      type,
                      min: 0,
                      max: 5,
                      direction: "higher",
                    });
                  else if (type === "categorical")
                    update(index, {
                      ...base,
                      type,
                      categories: ["relevant", "irrelevant"],
                    });
                  else if (type === "boolean") update(index, { ...base, type });
                  else
                    update(index, { ...base, type: "text", maxLength: 2000 });
                }}
              />
            </>
          )}
          <EditorField
            id={`field-${index}-description`}
            label="Grading guidance"
          >
            <Textarea
              id={`field-${index}-description`}
              value={field.description}
              onChange={(e) =>
                update(index, { ...field, description: e.target.value })
              }
            />
          </EditorField>
          {field.type === "numeric" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <EditorField id={`field-${index}-min`} label="Minimum">
                <Input
                  type="number"
                  id={`field-${index}-min`}
                  value={field.min}
                  onChange={(e) =>
                    update(index, { ...field, min: Number(e.target.value) })
                  }
                />
              </EditorField>
              <EditorField id={`field-${index}-max`} label="Maximum">
                <Input
                  type="number"
                  id={`field-${index}-max`}
                  value={field.max}
                  onChange={(e) =>
                    update(index, { ...field, max: Number(e.target.value) })
                  }
                />
              </EditorField>
              <EditorSelect
                id={`field-${index}-direction`}
                label="Better values"
                value={field.direction}
                options={[
                  { value: "higher", label: "Higher" },
                  { value: "lower", label: "Lower" },
                ]}
                onChange={(value) =>
                  update(index, {
                    ...field,
                    direction: value === "lower" ? "lower" : "higher",
                  })
                }
              />
            </div>
          )}
          {field.type === "categorical" && (
            <EditorField
              id={`field-${index}-categories`}
              label="Categories"
              description="One category per line. Categories have no numeric ordering."
            >
              <Textarea
                id={`field-${index}-categories`}
                value={field.categories.join("\n")}
                onChange={(e) =>
                  update(index, {
                    ...field,
                    categories: e.target.value.split("\n"),
                  })
                }
              />
            </EditorField>
          )}
          {index > 0 && (
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.abstain}
                  onChange={(e) =>
                    update(index, { ...field, abstain: e.target.checked })
                  }
                />
                Allow insufficient evidence or not applicable
              </label>
              <Button
                aria-label={`Remove field ${index + 1}`}
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  setFields((old) => old.filter((_, i) => i !== index))
                }
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </fieldset>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          setFields((old) => [
            ...old,
            {
              id: `field-${crypto.randomUUID().slice(0, 8)}`,
              label: "New field",
              type: "boolean",
              description: "",
              abstain: true,
            },
          ])
        }
        disabled={fields.length >= 20}
      >
        <Plus />
        Add field
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setError("");
            const parsed = ScoreGroupDefinitionSchema.safeParse({
              name,
              fields,
            });
            if (!parsed.success) {
              setError(
                parsed.error.issues[0]?.message ?? "Check field definitions.",
              );
              return;
            }
            setBusy(true);
            try {
              onCreated(
                ScoreGroupSchema.parse(
                  await evaluatorRequest(
                    initialGroup && initialGroup.id !== "assessment"
                      ? `score-groups/${initialGroup.id}/versions`
                      : "score-groups",
                    initialGroup && initialGroup.id !== "assessment"
                      ? {
                          baseVersion: initialGroup.version,
                          definition: parsed.data,
                        }
                      : parsed.data,
                  ),
                ),
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not save score group.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Create group
        </Button>
      </div>
    </section>
  );
}
