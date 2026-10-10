"use client";
import type { PromptContent } from "@kortyx/prompts";
import {
  canonicalPromptJson,
  PromptContentSchema,
  promptReferences,
  validatePromptContent,
} from "@kortyx/prompts";
import type { PromptDetail, PromptLibrary } from "@kortyx/telemetry-contracts";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { JsonCodeEditor } from "@/components/ui/json-code-editor";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";
import { PromptEditor } from "./prompt-editor";

export const editorClass =
  "min-h-32 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs leading-6 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60";
export function JsonField({
  label,
  value,
  onChange,
  description,
  disabled = false,
  onValidityChange,
}: {
  label: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  description?: string;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const id = useId(),
    [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  const accepted = useRef(canonicalPromptJson(value));
  useEffect(() => {
    const next = canonicalPromptJson(value);
    if (accepted.current !== next) {
      accepted.current = next;
      setText(JSON.stringify(value, null, 2));
      setError("");
      onValidityChange?.(true);
    }
  }, [value, onValidityChange]);
  const change = (next: string) => {
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
      accepted.current = canonicalPromptJson(parsed);
      setError("");
      onValidityChange?.(true);
      onChange(parsed as Record<string, unknown>);
    } catch {
      setError("Enter a valid JSON object before saving.");
      onValidityChange?.(false);
    }
  };
  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-xs font-medium">
        {label}
      </p>
      {description && (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      <div
        className={`min-w-0 overflow-hidden rounded-md border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 ${error ? "border-destructive" : ""}`}
      >
        <div className="flex h-9 items-center justify-between border-b bg-muted/30 px-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            JSON
          </span>
          {!disabled && (
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Format ${label}`}
              disabled={Boolean(error)}
              onClick={() => setText(JSON.stringify(JSON.parse(text), null, 2))}
            >
              Format
            </Button>
          )}
        </div>
        <JsonCodeEditor
          id={id}
          labelId={`${id}-label`}
          descriptionId={
            [description && `${id}-description`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          readOnly={disabled}
          value={text}
          invalid={Boolean(error)}
          onChange={change}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function PromptFields({
  value,
  library,
  ownKey,
  onChange,
  disabled = false,
  onValidityChange,
}: {
  value: PromptContent;
  library?: PromptLibrary;
  ownKey?: string;
  onChange: (value: PromptContent) => void;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const id = useId();
  const current = useRef(value);
  current.current = value;
  const update = (next: PromptContent) => {
    current.current = next;
    onChange(next);
  };
  const names = Object.fromEntries(
    (library?.assets ?? []).map((asset) => [asset.key, asset.name]),
  );
  const include = (version: PromptDetail["versions"][number]) => {
    const value = current.current;
    const existing = value.dependencies.find((dep) => dep.id === version.id);
    if (
      existing &&
      (existing.version !== version.version || existing.hash !== version.hash)
    )
      throw new Error(
        "This prompt is already included at another version. Remove that reference before choosing a different version.",
      );
    const properties = {
      ...((value.variablesSchema.properties as Record<
        string,
        PromptContent["config"][string]
      >) ?? {}),
    };
    for (const [key, schema] of Object.entries(
      (version.content.variablesSchema.properties as Record<
        string,
        PromptContent["config"][string]
      >) ?? {},
    )) {
      if (
        properties[key] &&
        canonicalPromptJson(properties[key]) !== canonicalPromptJson(schema)
      )
        throw new Error(
          `Template input ${key} has a different contract in this prompt.`,
        );
      properties[key] = schema;
    }
    const required = [
      ...new Set([
        ...((value.variablesSchema.required as string[]) ?? []),
        ...((version.content.variablesSchema.required as string[]) ?? []),
      ]),
    ];
    update({
      ...value,
      variablesSchema: {
        ...value.variablesSchema,
        properties,
        ...(required.length ? { required } : {}),
      },
      dependencies: existing
        ? value.dependencies
        : [
            ...value.dependencies,
            { id: version.id, version: version.version, hash: version.hash },
          ],
    });
  };
  const [invalid, setInvalid] = useState<string[]>([]);
  const validity = (field: string, valid: boolean) =>
    setInvalid((current) =>
      valid
        ? current.includes(field)
          ? current.filter((item) => item !== field)
          : current
        : current.includes(field)
          ? current
          : [...current, field],
    );
  useEffect(
    () => onValidityChange?.(invalid.length === 0),
    [invalid, onValidityChange],
  );
  return (
    <div className="space-y-6">
      {value.messages.map((message, index) => (
        <div key={`${index}:${message.role}`} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`${id}-message-${index}`}
              className="text-xs font-medium capitalize"
            >
              {message.role} message {value.format === "chat" ? index + 1 : ""}
            </label>
            {value.format === "chat" && !disabled && (
              <div className="flex items-center gap-1">
                <EvalDropdown
                  label={`Message ${index + 1} role`}
                  value={message.role}
                  disabled={disabled}
                  options={["system", "user", "assistant"].map((role) => ({
                    value: role,
                    label: role,
                  }))}
                  onChange={(role) =>
                    onChange({
                      ...value,
                      messages: value.messages.map((item, position) =>
                        position === index
                          ? { ...item, role: role as typeof message.role }
                          : item,
                      ),
                    })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove message ${index + 1}`}
                  disabled={disabled || value.messages.length === 1}
                  onClick={() =>
                    onChange({
                      ...value,
                      messages: value.messages.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
          <PromptEditor
            id={`${id}-message-${index}`}
            label={`${message.role[0]!.toUpperCase()}${message.role.slice(1)} Message${value.format === "chat" ? ` ${index + 1}` : ""}`}
            value={message.content}
            role={message.role}
            dependencies={value.dependencies}
            names={names}
            ownKey={ownKey}
            disabled={disabled}
            onInclude={include}
            onValidityChange={(valid) => validity(`message-${index}`, valid)}
            onChange={(text, references) => {
              const previous = current.current;
              const messages = previous.messages.map((item, position) =>
                position === index ? { ...item, content: text } : item,
              );
              const removed = promptReferences(previous).filter(
                (key) =>
                  !promptReferences({ ...previous, messages }).includes(key),
              );
              let dependencies = previous.dependencies.filter(
                (dep) => !removed.includes(dep.id),
              );
              for (const reference of references) {
                const existing = dependencies.find(
                  (dep) => dep.id === reference.id,
                );
                const inAnotherMessage = messages.some(
                  (item, position) =>
                    position !== index &&
                    promptReferences({
                      ...previous,
                      messages: [item],
                    }).includes(reference.id),
                );
                if (
                  existing &&
                  inAnotherMessage &&
                  (existing.version !== reference.version ||
                    existing.hash !== reference.hash)
                )
                  throw new Error(
                    "This prompt is included at another version in a different message.",
                  );
                dependencies = [
                  ...dependencies.filter((dep) => dep.id !== reference.id),
                  reference,
                ];
              }
              update({ ...previous, messages, dependencies });
            }}
          />
        </div>
      ))}
      {!disabled && (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || value.messages.length >= 100}
          onClick={() =>
            onChange({
              ...value,
              format: "chat",
              messages: [...value.messages, { role: "user", content: "" }],
            })
          }
        >
          <Plus className="size-3.5" />
          Add message
        </Button>
      )}
      <JsonField
        key="configuration"
        label="Configuration"
        onValidityChange={(valid) => validity("config", valid)}
        description="Saved values returned to your application as prompt.config. They are never inserted into messages."
        value={value.config}
        disabled={disabled}
        onChange={(config) =>
          onChange({ ...value, config: config as PromptContent["config"] })
        }
      />
      <details className="rounded-lg border">
        <summary className="cursor-pointer px-3 py-3 text-xs font-medium">
          Contracts & template inputs
        </summary>
        <div className="space-y-5 border-t p-4">
          <JsonField
            label="Template input schema"
            onValidityChange={(valid) => validity("variablesSchema", valid)}
            description="Declare values supplied by code for placeholders such as {{message}}."
            value={value.variablesSchema}
            disabled={disabled}
            onChange={(variablesSchema) =>
              onChange({
                ...value,
                variablesSchema:
                  variablesSchema as PromptContent["variablesSchema"],
              })
            }
          />
          <JsonField
            label="Configuration schema"
            onValidityChange={(valid) => validity("configSchema", valid)}
            description="Validate saved configuration, including supported model aliases."
            value={value.configSchema}
            disabled={disabled}
            onChange={(configSchema) =>
              onChange({
                ...value,
                configSchema: configSchema as PromptContent["configSchema"],
              })
            }
          />
        </div>
      </details>
    </div>
  );
}
export function validateEditor(value: PromptContent) {
  const parsed = PromptContentSchema.parse(value);
  validatePromptContent(parsed);
  return parsed;
}
