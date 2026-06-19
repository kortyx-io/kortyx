import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";
import "./globals.css";

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

const themeScript = `
  (function(){
    try {
      var s = localStorage.getItem('theme');
      var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var dark = s === 'dark' || ((s === null || s === 'system') && d);
      if (dark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } catch (_) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Theme script must run before paint to prevent flash
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
        <NuqsAdapter>
          <SidebarLayout>{children}</SidebarLayout>
        </NuqsAdapter>
      </body>
    </html>
  );
}
