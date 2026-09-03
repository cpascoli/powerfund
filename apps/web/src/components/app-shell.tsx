"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { SiteFooter } from "@/components/site-footer";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

/**
 * Surfaces built on the book. A viewer cannot read positions, cash, the ledger
 * or the queue — RLS refuses — so linking them would only offer a zeroed book,
 * which reads as "the fund is empty" rather than "this is not yours to see".
 */
const OPERATOR_ONLY_HREFS = new Set(["/briefing", "/portfolio"]);

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Playbook",
    items: [
      { href: "/docs/goals", label: "Goals" },
      { href: "/docs/mandate", label: "Mandate" },
      { href: "/docs/themes", label: "Themes" },
      { href: "/docs/plan", label: "Plan" },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/explore", label: "Explore" },
      { href: "/workbench", label: "Workbench" },
      { href: "/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/briefing", label: "Briefing", match: "exact" },
      { href: "/signals", label: "Signals" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/decisions", label: "Journal" },
    ],
  },
] as const;

function isCurrent(pathname: string, item: NavItem): boolean {
  if (item.match === "exact" || item.href === "/") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  operator,
  children,
}: {
  operator: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const groups = operator
    ? NAV_GROUPS
    : NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !OPERATOR_ONLY_HREFS.has(item.href)),
      })).filter((group) => group.items.length > 0);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Link href={operator ? "/briefing" : "/explore"}>
            <strong>Power Fund</strong>
            <span>Investment intelligence</span>
          </Link>
        </div>
        <nav className="nav" aria-label="Primary">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => {
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
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-footnote">
            Themes → names → evidence. Charts live in Workbench; capital lives in
            Portfolio.{" "}
            <Link href="/">Public site</Link>
          </p>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">
        <div className="main-content">{children}</div>
        <SiteFooter />
      </main>
    </div>
  );
}
