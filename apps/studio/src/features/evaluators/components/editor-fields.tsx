"use client";
import type { ReactNode } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export function EditorField({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} className="text-xs">
        {label}
      </FieldLabel>
      {children}
      {description && (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </Field>
  );
}
export function EditorSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  description,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <EditorField
      id={id}
      label={label}
      {...(description ? { description } : {})}
    >
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled ?? false}
      >
        <SelectTrigger
          id={id}
          className="h-8 w-full text-xs"
          aria-describedby={description ? `${id}-description` : undefined}
        >
          <SelectValue placeholder={`Select ${label.toLowerCase()}`}>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options
            .filter((o) => o.value)
            .map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </EditorField>
  );
}
