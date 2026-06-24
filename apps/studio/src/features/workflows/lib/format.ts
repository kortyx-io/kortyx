export function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDuration(value?: number) {
  if (value === undefined) return "—";
  return value >= 1000
    ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`
    : `${value}ms`;
}

export function formatCost(value?: number) {
  return value === undefined ? "—" : `$${value.toFixed(value < 0.01 ? 3 : 2)}`;
}
