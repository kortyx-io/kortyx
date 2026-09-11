import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Kortyx | Execution examples",
  description:
    "Chat, workflow execution, and human approval with one Kortyx agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav
          aria-label="Examples"
          className="flex h-14 items-center gap-6 border-b border-slate-800 px-6 text-sm"
        >
          <span className="mr-3 font-semibold">Kortyx examples</span>
          <Link href="/">Chat</Link>
          <Link href="/execute">Execute</Link>
          <Link href="/background">Background review</Link>
          <Link href="/limits">Limits / Continue</Link>
          <Link href="/resume">Resume / approvals</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
