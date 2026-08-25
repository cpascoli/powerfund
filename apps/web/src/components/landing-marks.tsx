import type { ReactNode } from "react";

function MarkSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Mark({ children }: { children: ReactNode }) {
  return (
    <span className="landing-mark" aria-hidden="true">
      <MarkSvg>{children}</MarkSvg>
    </span>
  );
}

/** Research, decision, risk — with a human in the loop. */
export function MarkWhat() {
  return (
    <Mark>
      <rect x="8" y="4.5" width="16" height="18.5" rx="2" fill="var(--bg-elevated)" />
      <path d="M11.5 10h9M11.5 14h9M11.5 18h5.5" />
      <path d="M7.5 25.5a8.8 8.8 0 0 0 17 0.2" />
      <path d="M22.2 27.2l2.2-3 2.6 1.7" />
    </Mark>
  );
}

/** A name found before the crowd prices it. */
export function MarkWhy() {
  return (
    <Mark>
      <path d="M4 25.5h24" />
      <path d="M7 25.5V11.5l3.5 3.6L14.5 6v19.5" />
      <path d="M19 25.5v-7.2l2.2 2.4 3.2-6.2 3.1 11" opacity="0.42" />
    </Mark>
  );
}

/** A written mandate that is actually followed. */
export function MarkGoals() {
  return (
    <Mark>
      <rect x="6.5" y="4.5" width="19" height="23" rx="2.2" fill="var(--bg-elevated)" />
      <path d="M10.5 11.5h11M10.5 16h11M10.5 20.5h6" />
      <circle cx="22.2" cy="22.4" r="4" fill="var(--bg-elevated)" />
      <path d="M20.3 22.4l1.35 1.45 2.7-3" />
    </Mark>
  );
}

/** Ingest → theme → thesis → journal. */
export function MarkHow() {
  return (
    <Mark>
      <circle cx="10" cy="10" r="3.15" fill="var(--bg-elevated)" />
      <circle cx="22" cy="10" r="3.15" fill="var(--bg-elevated)" />
      <circle cx="22" cy="22" r="3.15" fill="var(--bg-elevated)" />
      <circle cx="10" cy="22" r="3.15" fill="var(--bg-elevated)" />
      <path d="M13.2 10h5.6M22 13.2v5.6M18.8 22h-5.6" />
    </Mark>
  );
}

/** Breadth in, concentrate on the bottleneck. */
export function MarkThink() {
  return (
    <Mark>
      <path d="M5.5 6h21L18.2 16l8.3 10H5.5L13.8 16z" fill="var(--bg-elevated)" />
      <path d="M13.8 16h4.4" />
    </Mark>
  );
}
