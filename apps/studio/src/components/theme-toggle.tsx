"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
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
  localStorage.removeItem("theme");
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

  useEffect(() => {
    const bootstrappedTheme = document.documentElement.dataset.themePreference;
    if (
      bootstrappedTheme === "light" ||
      bootstrappedTheme === "dark" ||
      bootstrappedTheme === "system"
    ) {
      setThemeState(bootstrappedTheme);
    }
  }, []);

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
    <fieldset className="grid gap-2 sm:grid-cols-3">
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
              "flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              selected
                ? "border-foreground/30 bg-accent text-accent-foreground"
                : "bg-background hover:bg-accent/60",
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                {option.description}
              </span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
