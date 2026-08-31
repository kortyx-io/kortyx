import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/lib/site";
import "./globals.css";
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
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Kortyx | TypeScript Application Framework for AI Agents",
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: "Developer Tools",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  openGraph: {
    title: "Kortyx | TypeScript Application Framework for AI Agents",
    description: siteConfig.description,
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "Kortyx, the TypeScript application framework for agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kortyx | TypeScript Application Framework for AI Agents",
    description: siteConfig.description,
    creator: siteConfig.twitterHandle,
    images: [siteConfig.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Theme state must be set before paint to prevent flashes
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
