import { Button } from "@/components/ui/button";
import { FilterCheckbox } from "@/features/telemetry/components/list-filter-panel";

export function FilterCheckboxGroup<T extends string>({
  items,
  selected,
  labels,
  onChange,
}: {
  items: readonly T[];
  selected: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (next: T[]) => void;
}) {
  const allSelected = selected.length === items.length;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="mb-1 ml-2"
        onClick={() => onChange(allSelected ? [] : [...items])}
      >
        {allSelected ? "Deselect all" : "Select all"}
      </Button>
      {items.map((item) => (
        <FilterCheckbox
          key={item}
          label={labels?.[item] ?? item}
          checked={selected.includes(item)}
          onChange={() =>
            onChange(
              selected.includes(item)
                ? selected.filter((value) => value !== item)
                : [...selected, item],
            )
          }
        />
      ))}
    </>
  );
}
