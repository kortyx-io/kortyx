"use client";
import type { PromptContent } from "@kortyx/prompts";
import { PromptContentSchema, validatePromptContent } from "@kortyx/prompts";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { EvalDropdown } from "@/features/evals/components/eval-dropdown";

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
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <textarea
        id={id}
        spellCheck={false}
        readOnly={disabled}
        className={editorClass}
        value={text}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          setText(event.target.value);
          try {
            const parsed: unknown = JSON.parse(event.target.value);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error();
            setError("");
            onValidityChange?.(true);
            onChange(parsed as Record<string, unknown>);
          } catch {
            setError("Enter a valid JSON object before saving.");
            onValidityChange?.(false);
          }
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function PromptFields({
  value,
  onChange,
  disabled = false,
  onValidityChange,
}: {
  value: PromptContent;
  onChange: (value: PromptContent) => void;
  disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState<string[]>([]);
  const validity = (field: string, valid: boolean) =>
    setInvalid((current) =>
      valid
        ? current.filter((item) => item !== field)
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
      <div className="space-y-2">
        <p className="text-xs font-medium">Message format</p>
        {disabled ? (
          <p className="inline-flex rounded-md border bg-muted/30 px-3 py-2 text-xs">
            {value.format === "system-user"
              ? "System + user"
              : "Ordered chat messages"}
          </p>
        ) : (
          <EvalDropdown
            label="Message format"
            value={value.format}
            disabled={disabled}
            options={[
              { value: "system-user", label: "System + user" },
              { value: "chat", label: "Ordered chat messages" },
            ]}
            onChange={(format) =>
              onChange({
                ...value,
                format: format as PromptContent["format"],
                messages:
                  format === "system-user"
                    ? [
                        {
                          role: "system",
                          content:
                            value.messages.find(
                              (message) => message.role === "system",
                            )?.content ?? "",
                        },
                        {
                          role: "user",
                          content:
                            value.messages.find(
                              (message) => message.role === "user",
                            )?.content ?? "",
                        },
                      ]
                    : value.messages,
              })
            }
          />
        )}
      </div>
      {value.messages.map((message, index) => (
        <div key={`${index}:${message.role}`} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`${id}-message-${index}`}
              className="text-xs font-medium capitalize"
            >
              {message.role} message {value.format === "chat" ? index + 1 : ""}
            </label>
            {value.format === "chat" && (
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
          <textarea
            id={`${id}-message-${index}`}
            readOnly={disabled}
            spellCheck={false}
            className={editorClass}
            value={message.content}
            onChange={(event) =>
              onChange({
                ...value,
                messages: value.messages.map((item, position) =>
                  position === index
                    ? { ...item, content: event.target.value }
                    : item,
                ),
              })
            }
          />
        </div>
      ))}
      {value.format === "chat" && (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || value.messages.length >= 100}
          onClick={() =>
            onChange({
              ...value,
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
