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
