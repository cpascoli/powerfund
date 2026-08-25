"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

const PUBLIC_NAV: readonly NavItem[] = [
  { href: "/explore", label: "Explore" },
  { href: "/workbench", label: "Markets" },
  { href: "/calendar", label: "Calendar" },
  { href: "/docs", label: "Playbook" },
];

function isCurrent(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function PublicShell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <div className={isLanding ? "public-shell is-landing" : "public-shell"}>
      <header className="public-bar">
        <Link className="public-brand" href="/">
          <strong>Power Fund</strong>
          <span>Investment intelligence</span>
        </Link>
        <nav className="public-nav" aria-label="Primary">
          {PUBLIC_NAV.map((item) => {
            const current = isCurrent(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          {signedIn ? (
            <Link className="buttonish" href="/briefing">
              Briefing
            </Link>
          ) : (
            <Link className="buttonish" href="/login">
              Operator sign in
            </Link>
          )}
        </nav>
      </header>
      {isLanding ? (
        <>
          <main className="landing">{children}</main>
          <div className="public-footer-wrap">
            <SiteFooter />
          </div>
        </>
      ) : (
        <main className="main">
          <div className="main-content">{children}</div>
          <SiteFooter />
        </main>
      )}
    </div>
  );
}
