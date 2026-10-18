"use client";

import { useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export function FilterAutocomplete({
  id,
  label,
  value,
  options,
  placeholder,
  className,
  onFocus,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  className?: string;
  onFocus: () => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <Combobox<string>
        items={options}
        filter={null}
        value={value || null}
        inputValue={value}
        onInputValueChange={(next, details) => {
          if (
            details.reason === "input-change" ||
            details.reason === "input-clear"
          )
            onChange(next);
        }}
        onValueChange={(next) => onChange(next ?? "")}
        open={open}
        onOpenChange={setOpen}
      >
        <ComboboxInput
          id={id}
          aria-label={`${label} value`}
          autoComplete="off"
          placeholder={placeholder}
          className="w-full"
          onFocus={() => {
            onFocus();
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) event.stopPropagation();
          }}
        />
        <ComboboxContent className="min-w-(--anchor-width) border ring-0">
          <ComboboxEmpty>No matching values</ComboboxEmpty>
          <ComboboxList aria-label={`${label} suggestions`}>
            {(option: string) => (
              <ComboboxItem key={option} value={option} title={option}>
                <span className="min-w-0 truncate font-normal">{option}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
