import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";

import { SiteChrome } from "@/components/site-chrome";
import { getSessionUser } from "@/lib/supabase/server";

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
    "Investment intelligence for AI, energy, robotics, and defence.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getSessionUser();

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
        <SiteChrome signedIn={user != null}>{children}</SiteChrome>
      </body>
    </html>
  );
}
