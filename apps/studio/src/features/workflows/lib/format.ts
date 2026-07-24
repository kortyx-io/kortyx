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

/** Log-scaled edge weight for health/volume mode; safe for volume=0. */
export function getTransitionStrokeWidth(
  mode: "system" | "health" | undefined,
  metric: string | undefined,
  volume: number | undefined,
): number {
  if (mode !== "health" || metric !== "volume") return 2;
  const scaled = 1.5 + Math.log10(Math.max(1, volume ?? 0)) / 2;
  return Math.min(5, Math.max(1, scaled));
}

export function getTransitionLayoutWeight(volume: number): number {
  return Math.max(1, Math.round(Math.log10(Math.max(1, volume))));
}
