import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SidebarLayout>{children}</SidebarLayout>
      </body>
    </html>
  );
}
