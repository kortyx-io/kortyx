export function register() {
  try {
    const storedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const isDark =
      storedTheme === "dark" ||
      ((storedTheme === null || storedTheme === "system") && systemPrefersDark);

    document.documentElement.classList.toggle("dark", isDark);
  } catch {
    // Theme initialization is best-effort; rendering must not be blocked.
  }
}
