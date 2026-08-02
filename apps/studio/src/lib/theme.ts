export const THEME_PREFERENCE_COOKIE = "theme";
export const THEME_RESOLVED_COOKIE = "theme_resolved";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function parseThemePreference(
  value: string | undefined,
): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function parseResolvedTheme(
  value: string | undefined,
): ResolvedTheme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

export function serverResolvedTheme(
  preference: ThemePreference,
  remembered: ResolvedTheme | undefined,
): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return remembered ?? "light";
}
