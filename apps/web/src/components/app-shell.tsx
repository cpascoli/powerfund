"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

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
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/", label: "Briefing", match: "exact" },
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Power Fund</strong>
          <span>Investment intelligence</span>
        </div>
        <nav className="nav" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
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
            Portfolio.
          </p>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
