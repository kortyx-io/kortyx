import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";
import { ThemeProvider } from "@/components/theme-toggle";
import {
  parseResolvedTheme,
  parseThemePreference,
  serverResolvedTheme,
  THEME_PREFERENCE_COOKIE,
  THEME_RESOLVED_COOKIE,
} from "@/lib/theme";
import "./globals.css";

const themeInitializer = `(() => {
  try {
    const readCookie = (name) => {
      const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    };
    const legacy = localStorage.getItem("theme");
    const stored = readCookie("${THEME_PREFERENCE_COOKIE}");
    const preference =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : legacy === "light" || legacy === "dark"
          ? legacy
          : "system";
    const dark =
      preference === "dark" ||
      (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const resolved = dark ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = resolved;
    root.dataset.themePreference = preference;
    root.dataset.themeResolved = resolved;
    document.cookie = "${THEME_PREFERENCE_COOKIE}=" + preference + "; Path=/; Max-Age=31536000; SameSite=Lax";
    document.cookie = "${THEME_RESOLVED_COOKIE}=" + resolved + "; Path=/; Max-Age=31536000; SameSite=Lax";
    localStorage.removeItem("theme");
  } catch {}
})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kortyx Studio",
  description: "AI agent orchestration studio",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = parseThemePreference(
    cookieStore.get(THEME_PREFERENCE_COOKIE)?.value,
  );
  const resolvedTheme = serverResolvedTheme(
    theme,
    parseResolvedTheme(cookieStore.get(THEME_RESOLVED_COOKIE)?.value),
  );

  return (
    <html
      lang="en"
      className={resolvedTheme === "dark" ? "dark" : undefined}
      style={{ colorScheme: resolvedTheme }}
      data-theme-preference={theme}
      data-theme-resolved={resolvedTheme}
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-initializer"
          // The server handles known themes. This pre-paint fallback migrates
          // legacy localStorage and resolves the OS preference for "system".
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static, non-user-authored bootstrap must run before first paint.
          dangerouslySetInnerHTML={{ __html: themeInitializer }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider initialTheme={theme}>
          <NuqsAdapter>
            <SidebarLayout>{children}</SidebarLayout>
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
