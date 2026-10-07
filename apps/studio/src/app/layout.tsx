import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { DetailDrawerHost } from "@/components/detail/detail-drawer";
import { DetailSlotPresence } from "@/components/detail/detail-slot-presence";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";
import { ThemeProvider } from "@/components/theme-toggle";
import {
  parseResolvedTheme,
  parseThemePreference,
  serverResolvedTheme,
  THEME_PREFERENCE_COOKIE,
  THEME_RESOLVED_COOKIE,
} from "@/lib/theme";
import "@studio/styles";
import { Providers } from "./providers";

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
  interruptDrawer,
  runDrawer,
  sessionDrawer,
  evalCaseDrawer,
  evalSuiteDrawer,
}: Readonly<{
  children: React.ReactNode;
  interruptDrawer: React.ReactNode;
  runDrawer: React.ReactNode;
  sessionDrawer: React.ReactNode;
  evalCaseDrawer: React.ReactNode;
  evalSuiteDrawer: React.ReactNode;
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ThemeProvider initialTheme={theme}>
            <NuqsAdapter>
              <SidebarLayout
                detailSlots={
                  <DetailDrawerHost>
                    <DetailSlotPresence dismissPath="/evals/suites">
                      {evalSuiteDrawer}
                    </DetailSlotPresence>
                    <DetailSlotPresence dismissPath="/evals/cases">
                      {evalCaseDrawer}
                    </DetailSlotPresence>
                    <DetailSlotPresence dismissPath="/sessions">
                      {sessionDrawer}
                    </DetailSlotPresence>
                    <DetailSlotPresence dismissPath="/runs">
                      {runDrawer}
                    </DetailSlotPresence>
                    <DetailSlotPresence dismissPath="/interrupts">
                      {interruptDrawer}
                    </DetailSlotPresence>
                  </DetailDrawerHost>
                }
              >
                {children}
              </SidebarLayout>
            </NuqsAdapter>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
