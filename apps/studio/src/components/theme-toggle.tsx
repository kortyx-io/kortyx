"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  THEME_PREFERENCE_COOKIE,
  THEME_RESOLVED_COOKIE,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function writeThemeCookie(name: string, value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: Theme must persist before the next server navigation.
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.themePreference = theme;
  root.dataset.themeResolved = dark ? "dark" : "light";
  writeThemeCookie(THEME_PREFERENCE_COOKIE, theme);
  writeThemeCookie(THEME_RESOLVED_COOKIE, dark ? "dark" : "light");
  try {
    localStorage.removeItem("theme");
  } catch {
    /* Cookies remain the source of truth when storage is blocked. */
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemePreference;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState(initialTheme);

  useLayoutEffect(() => {
    // Cookies drive SSR. Resolve a first-visit OS preference and migrate the
    // old localStorage value through React, without rendering a script element.
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem("theme");
    } catch {
      /* Storage may be blocked. */
    }
    const hasPreference = document.cookie
      .split("; ")
      .some((cookie) => cookie.startsWith(`${THEME_PREFERENCE_COOKIE}=`));
    const next =
      !hasPreference && (legacy === "light" || legacy === "dark")
        ? legacy
        : initialTheme;
    setThemeState(next);
    applyTheme(next);
  }, [initialTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    setThemeState(next);
    applyTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeMenuSub() {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

const THEME_OPTIONS = [
  {
    value: "light",
    label: "Light",
    description: "Always use the light theme.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark theme.",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follow this device’s appearance.",
    icon: Monitor,
  },
] satisfies Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}>;

export function ThemePreferenceControl() {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset className="grid gap-4 sm:grid-cols-3">
      <legend className="sr-only">Theme preference</legend>
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "min-w-0 overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              selected
                ? "border-foreground/30 bg-accent text-accent-foreground"
                : "bg-background hover:bg-accent/60",
            )}
          >
            <div className="p-4" aria-hidden="true">
              <ThemePreview mode={option.value} />
            </div>
            <span className="flex items-center gap-2 border-t px-4 py-3">
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  selected &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {selected && <Check className="size-3" />}
              </span>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">
                {option.value === "system"
                  ? "System preference"
                  : `${option.label} mode`}
              </span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

function ThemePreview({ mode }: { mode: ThemePreference }) {
  const preview = (dark: boolean) => (
    <div
      className={cn(
        "absolute inset-0 flex",
        dark ? "bg-slate-950" : "bg-slate-50",
      )}
    >
      <div
        className={cn(
          "w-1/4 border-r p-2",
          dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white",
        )}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "mt-2 h-1.5 rounded",
              dark ? "bg-slate-600" : "bg-slate-200",
            )}
          />
        ))}
      </div>
      <div className="flex-1 p-3">
        <div
          className={cn(
            "mb-2 h-2 w-2/3 rounded",
            dark ? "bg-slate-600" : "bg-slate-200",
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "h-7 rounded",
                dark ? "bg-slate-700" : "bg-slate-200/70",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <div className="relative h-28 overflow-hidden rounded-md border">
      {preview(mode === "dark")}
      {mode === "system" && (
        <div
          className="absolute inset-0"
          style={{ clipPath: "inset(0 0 0 50%)" }}
        >
          {preview(true)}
        </div>
      )}
    </div>
  );
}
