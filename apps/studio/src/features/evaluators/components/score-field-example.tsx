import type { ScoreField } from "@kortyx/telemetry-contracts";
import { Eye, LockKeyhole, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FIELD_TYPES, fieldKind } from "./score-field-type";

export function ScoreFieldExample({ field }: { field: ScoreField }) {
  const type = FIELD_TYPES[fieldKind(field)];
  const min = field.type === "number" ? field.min : 0;
  const max = field.type === "number" ? field.max : 1;
  const validRange =
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    max > min &&
    (field.type !== "number" ||
      !field.integer ||
      (Number.isInteger(min) && Number.isInteger(max)));
  const number =
    field.type === "number" && field.preset === "score"
      ? 0.8
      : field.type === "number" && field.integer
        ? Math.round(min + (max - min) * 0.75)
        : min + (max - min) / 2;
  return (
    <section
      aria-label="Example field output"
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4",
        type.background,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-medium">
          <Eye className="size-3.5" aria-hidden="true" />
          Example output
        </h3>
        <span className="text-[10px] text-muted-foreground">Illustrative</span>
      </div>
      {field.type === "number" ? (
        validRange ? (
          <>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {new Intl.NumberFormat("en-US", {
                maximumFractionDigits: 2,
              }).format(number)}
              {field.preset === "rating" && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / {max}
                </span>
              )}
            </p>
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-background/80">
                <div
                  className={cn(
                    "h-full rounded-full bg-current opacity-70",
                    type.color,
                  )}
                  style={{
                    width: `${Math.max(0, Math.min(100, ((number - min) / (max - min)) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>{min}</span>
                <span>{max}</span>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {field.direction === "higher" ? (
                <>
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                  Higher is better
                </>
              ) : field.direction === "lower" ? (
                <>
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                  Lower is better
                </>
              ) : (
                "Values have no quality ordering"
              )}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Set a valid range to see an example.
          </p>
        )
      ) : field.type === "boolean" ? (
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-background">
            True
          </Badge>
          <Badge
            variant="outline"
            className="font-normal text-muted-foreground"
          >
            False
          </Badge>
        </div>
      ) : field.type === "category" ? (
        <div className="flex flex-wrap gap-2">
          {field.options.slice(0, field.multiple ? 2 : 1).map((option) => (
            <Badge key={option.id} variant="outline" className="bg-background">
              {option.label || "Category"}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6">
          A written explanation of the conclusion, supporting evidence and any
          limitations.
        </p>
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">
        {field.type === "category"
          ? field.multiple
            ? "The judge can return any matching categories, including none."
            : "The judge returns one of your categories."
          : field.type === "boolean"
            ? "The judge returns true or false, with a reason."
            : "Actual values are generated when you run the judge."}
      </p>
    </section>
  );
}

export function ScoreFieldEvidenceSummary({ field }: { field: ScoreField }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
      <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {field.id === "assessment"
          ? "Assessment always requires a written explanation, including when evidence is limited."
          : [
              field.allowInsufficientEvidence &&
                "Can report insufficient evidence",
              field.allowNotApplicable && "Can report not applicable",
            ]
              .filter(Boolean)
              .join(" · ") || "A value is required for this field."}
      </span>
    </div>
  );
}
