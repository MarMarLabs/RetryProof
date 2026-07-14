import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RetryProof — Workflow Flight Test",
  description: "Break consequential automation workflows under deterministic retry faults before production.",
  applicationName: "RetryProof",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#050d17",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
