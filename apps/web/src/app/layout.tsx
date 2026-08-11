import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: {
    default: "Power Fund",
    template: "%s · Power Fund",
  },
  description:
    "Investment intelligence — research, signals, portfolio, and visualization workbench.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable}`}>
      <body
        style={
          {
            "--font-sans": "var(--font-dm-sans), 'Segoe UI', sans-serif",
            "--font-display": "var(--font-space-grotesk), 'Avenir Next', sans-serif",
          } as CSSProperties
        }
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
