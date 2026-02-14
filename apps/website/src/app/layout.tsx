import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
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
  title: "Kortyx",
  description: "Kortyx documentation and developer guides",
};

const themeScript = `
  (function(){
    var s=localStorage.getItem('theme');
    var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
    if(s==='dark'||(!s&&d))document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
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
        <Navbar />
        {children}
      </body>
    </html>
  );
}
