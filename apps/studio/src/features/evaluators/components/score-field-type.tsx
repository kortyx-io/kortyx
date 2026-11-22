import type { ScoreField } from "@kortyx/telemetry-contracts";
import {
  AlignLeft,
  Gauge,
  Hash,
  ListFilter,
  Star,
  ToggleLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const FIELD_TYPES = {
  score: {
    label: "Score",
    detail: "Decimal from 0 to 1",
    icon: Gauge,
    color: "text-[color-mix(in_oklab,var(--chart-3)_65%,var(--foreground))]",
    background: "bg-chart-3/10",
    description: "Measure quality on a continuous scale.",
  },
  rating: {
    label: "Rating",
    detail: "Whole-number scale",
    icon: Star,
    color: "text-[color-mix(in_oklab,var(--chart-1)_65%,var(--foreground))]",
    background: "bg-chart-1/10",
    description: "Use a rubric such as 1 to 5.",
  },
  custom: {
    label: "Number",
    detail: "Custom range",
    icon: Hash,
    color: "text-[color-mix(in_oklab,var(--chart-5)_65%,var(--foreground))]",
    background: "bg-chart-5/10",
    description: "Return a count or bounded measurement.",
  },
  boolean: {
    label: "Boolean",
    detail: "True or false",
    icon: ToggleLeft,
    color: "text-[color-mix(in_oklab,var(--chart-2)_65%,var(--foreground))]",
    background: "bg-chart-2/10",
    description: "Check whether a condition is met.",
  },
  category: {
    label: "Category",
    detail: "One or more labels",
    icon: ListFilter,
    color: "text-[color-mix(in_oklab,var(--chart-4)_65%,var(--foreground))]",
    background: "bg-chart-4/15",
    description: "Choose from categories you define.",
  },
  text: {
    label: "Text",
    detail: "Written explanation",
    icon: AlignLeft,
    color: "text-[color-mix(in_oklab,var(--chart-3)_65%,var(--foreground))]",
    background: "bg-chart-3/10",
    description: "Return an assessment or free-form text.",
  },
} as const;
export type FieldKind = keyof typeof FIELD_TYPES;
export const fieldKind = (field: ScoreField): FieldKind =>
  field.type === "number" ? field.preset : field.type;
export const scoreFieldLabel = (field: ScoreField) =>
  field.type === "number"
    ? `${FIELD_TYPES[field.preset].label} · ${field.min}–${field.max}`
    : field.type === "category" && field.multiple
      ? "Category · multiple"
      : FIELD_TYPES[fieldKind(field)].label;
export function ScoreFieldMark({
  kind,
  small = false,
}: {
  kind: FieldKind;
  small?: boolean;
}) {
  const type = FIELD_TYPES[kind];
  const Icon = type.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        small ? "size-8" : "size-10",
        type.background,
        type.color,
      )}
    >
      <Icon className={small ? "size-4" : "size-5"} />
    </span>
  );
}
export function makeScoreField(kind: FieldKind, id: string): ScoreField {
  const common = {
    id,
    label: FIELD_TYPES[kind].label,
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
    preset: kind,
    min: kind === "rating" ? 1 : 0,
    max: kind === "score" ? 1 : kind === "rating" ? 5 : 100,
    integer: kind === "rating",
    direction: "higher",
  };
}
