"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PublicShell } from "@/components/public-shell";

export function SiteChrome({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (pathname === "/" || !signedIn) {
    return <PublicShell signedIn={signedIn}>{children}</PublicShell>;
  }

  return <AppShell>{children}</AppShell>;
}
