import { aiCapexNavPct, aiMemoryNavPct, RISK_DEFAULTS } from "@powerfund/domain";

import type { DecisionListItem } from "@/lib/data/decisions";
import type { PlannedActionRow } from "@/lib/data/planned-actions";
import type { MandateFlag, PortfolioBook } from "@/lib/data/portfolio";
import type { DossierReviewRow, InstrumentWithTheme, ThemeRow } from "@/lib/data/research";

export const THESIS_REVIEW_AFTER_DAYS = 7;
export const DILIGENCE_STALE_AFTER_DAYS = 14;
export const UPCOMING_WEEK_DAYS = 7;

export type AttentionKind =
  | "flag"
  | "overdue"
  | "due_today"
  | "missing_invalidation"
  | "thesis_review"
  | "diligence";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  href: string;
};

export type UpcomingSection = {
  id: "this_week" | "later" | "undated";
  label: string;
  actions: PlannedActionRow[];
};

export type ThemePulse = {
  slug: string;
  name: string;
  description: string | null;
  isCore: boolean;
  watchlistCount: number;
  bookCount: number;
  weightPctNav: number;
  overCap: boolean;
};

export type BookPulse = {
  largest: { symbol: string; weightPctNav: number } | null;
  aiCapexPctNav: number | null;
  aiMemoryPctNav: number | null;
};

const OPEN_THESIS_TYPES = new Set<DecisionListItem["decision_type"]>([
  "enter",
  "add",
  "hold",
]);

const LIVE_DILIGENCE_STATUSES = new Set<DossierReviewRow["status"]>([
  "investigate",
  "active_thesis",
]);

const KIND_ORDER: Record<AttentionKind, number> = {
  flag: 0,
  overdue: 1,
  due_today: 2,
  missing_invalidation: 3,
  thesis_review: 4,
  diligence: 5,
};

export function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function daysUntil(date: string, today = startOfUtcDay()): number {
  return Math.round(
    (new Date(`${date}T00:00:00Z`).getTime() - today.getTime()) / 86_400_000,
  );
}

export function daysSince(iso: string, today = startOfUtcDay()): number {
  const stamp = new Date(iso);
  const then = new Date(
    Date.UTC(stamp.getUTCFullYear(), stamp.getUTCMonth(), stamp.getUTCDate()),
  );
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

export function attentionKindLabel(kind: AttentionKind): string {
  switch (kind) {
    case "flag":
      return "Flag";
    case "overdue":
      return "Overdue";
    case "due_today":
      return "Due";
    case "missing_invalidation":
      return "Kill";
    case "thesis_review":
      return "Review";
    case "diligence":
      return "Diligence";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function isUrgentAttention(kind: AttentionKind): boolean {
  switch (kind) {
    case "flag":
    case "overdue":
    case "due_today":
    case "missing_invalidation":
      return true;
    case "thesis_review":
    case "diligence":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function bookPulse(book: PortfolioBook): BookPulse {
  const largest = book.positions.reduce<{
    symbol: string;
    weightPctNav: number;
  } | null>((best, row) => {
    if (row.weightPctNav == null) return best;
    if (best == null || row.weightPctNav > best.weightPctNav) {
      return { symbol: row.symbol, weightPctNav: row.weightPctNav };
    }
    return best;
  }, null);

  const mandatePositions = book.positions.map((row) => ({
    symbol: row.symbol,
    themeSlug: row.themeSlug,
    marketValue: row.marketValue ?? row.costBasis,
    costBasis: row.costBasis,
  }));

  return {
    largest,
    aiCapexPctNav: aiCapexNavPct(mandatePositions, book.nav),
    aiMemoryPctNav: aiMemoryNavPct(mandatePositions, book.nav),
  };
}

export function buildAttentionItems(args: {
  bookFlags: MandateFlag[];
  queueFlags: MandateFlag[];
  queue: PlannedActionRow[];
  book: PortfolioBook;
  decisions: DecisionListItem[];
  dossiers: DossierReviewRow[];
  instruments: InstrumentWithTheme[];
  today?: Date;
}): AttentionItem[] {
  const today = args.today ?? startOfUtcDay();
  const items: AttentionItem[] = [];
  const onBook = new Set(args.book.positions.map((row) => row.instrumentId));
  const byId = new Map(args.instruments.map((row) => [row.id, row]));

  for (const flag of [...args.bookFlags, ...args.queueFlags]) {
    if (flag.severity !== "warn") continue;
    const fromQueue = args.queueFlags.includes(flag);
    items.push({
      id: `flag-${flag.code}-${fromQueue ? "queue" : "book"}`,
      kind: "flag",
      title: flag.label,
      detail: fromQueue
        ? "Queue vs current NAV — confirm, defer, or cancel"
        : "Mandate check — open the book or mandate tab",
      href: fromQueue ? "/portfolio?tab=queue" : "/portfolio?tab=mandate",
    });
  }

  for (const action of args.queue) {
    if (action.dueBy == null) continue;
    const days = daysUntil(action.dueBy, today);
    if (days > 0) continue;
    const overdue = days < 0;
    items.push({
      id: `queue-${action.id}`,
      kind: overdue ? "overdue" : "due_today",
      title: `${overdue ? "Confirm, defer, or cancel" : "Due today"}: ${action.symbol} ${action.actionType}`,
      detail: overdue
        ? `Was due ${action.dueBy}`
        : action.windowLabel ?? "Due today",
      href: `/portfolio?confirm=${action.id}`,
    });
  }

  for (const position of args.book.positions) {
    if (position.invalidation?.trim()) continue;
    items.push({
      id: `kill-${position.id}`,
      kind: "missing_invalidation",
      title: `Write invalidation for ${position.symbol}`,
      detail: "Mandate rule 4 — kill criteria before or at fill",
      href: `/portfolio?tab=book`,
    });
  }

  const latestOpen = new Map<string, DecisionListItem>();
  for (const decision of args.decisions) {
    if (!OPEN_THESIS_TYPES.has(decision.decision_type)) continue;
    if (decision.reviewed_at || decision.outcome_grade) continue;
    const key = decision.instrument_id ?? decision.id;
    const existing = latestOpen.get(key);
    if (existing == null || decision.action_at > existing.action_at) {
      latestOpen.set(key, decision);
    }
  }
  for (const decision of latestOpen.values()) {
    if (daysSince(decision.action_at, today) < THESIS_REVIEW_AFTER_DAYS) {
      continue;
    }
    const symbol = decision.symbol ?? "theme-level";
    items.push({
      id: `review-${decision.id}`,
      title: `Review ${decision.decision_type} ${symbol}`,
      kind: "thesis_review",
      detail: `Opened ${decision.action_at.slice(0, 10)} — weekly review is due`,
      href: `/decisions/${decision.id}`,
    });
  }

  for (const dossier of args.dossiers) {
    if (!dossier.nextDiligence?.trim()) continue;
    if (daysSince(dossier.updatedAt, today) < DILIGENCE_STALE_AFTER_DAYS) {
      continue;
    }
    const live =
      LIVE_DILIGENCE_STATUSES.has(dossier.status) ||
      onBook.has(dossier.instrumentId);
    if (!live) continue;
    const instrument = byId.get(dossier.instrumentId);
    if (!instrument) continue;
    items.push({
      id: `diligence-${dossier.instrumentId}`,
      kind: "diligence",
      title: `Next diligence on ${instrument.symbol}`,
      detail: dossier.nextDiligence,
      href: `/explore/${instrument.symbol}`,
    });
  }

  return items.sort((a, b) => {
    const kindCmp = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindCmp !== 0) return kindCmp;
    return a.title.localeCompare(b.title);
  });
}

export function upcomingSections(
  actions: PlannedActionRow[],
  today = startOfUtcDay(),
): UpcomingSection[] {
  const dated = [...actions].sort((a, b) => {
    if (a.dueBy && b.dueBy) return a.dueBy.localeCompare(b.dueBy);
    if (a.dueBy) return -1;
    if (b.dueBy) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const thisWeek: PlannedActionRow[] = [];
  const later: PlannedActionRow[] = [];
  const undated: PlannedActionRow[] = [];

  for (const action of dated) {
    if (action.dueBy == null) {
      undated.push(action);
      continue;
    }
    const days = daysUntil(action.dueBy, today);
    if (days < 0) continue;
    if (days <= UPCOMING_WEEK_DAYS) {
      thisWeek.push(action);
    } else {
      later.push(action);
    }
  }

  return [
    { id: "this_week", label: "This week", actions: thisWeek },
    { id: "later", label: "Later", actions: later },
    { id: "undated", label: "No date", actions: undated },
  ];
}

export function themePulse(args: {
  themes: ThemeRow[];
  instruments: InstrumentWithTheme[];
  book: PortfolioBook;
}): ThemePulse[] {
  const watchlistCounts = new Map<string, number>();
  for (const instrument of args.instruments) {
    watchlistCounts.set(
      instrument.theme_slug,
      (watchlistCounts.get(instrument.theme_slug) ?? 0) + 1,
    );
  }

  const bookCounts = new Map<string, number>();
  for (const position of args.book.positions) {
    bookCounts.set(
      position.themeSlug,
      (bookCounts.get(position.themeSlug) ?? 0) + 1,
    );
  }

  const exposureBySlug = new Map(
    args.book.themeExposures.map((theme) => [theme.slug, theme]),
  );

  return args.themes
    .map((theme) => {
      const exposure = exposureBySlug.get(theme.slug);
      const weightPctNav = exposure?.weightPctNav ?? 0;
      return {
        slug: theme.slug,
        name: theme.name,
        description: theme.description,
        isCore: theme.is_core,
        watchlistCount: watchlistCounts.get(theme.slug) ?? 0,
        bookCount: bookCounts.get(theme.slug) ?? 0,
        weightPctNav,
        overCap: weightPctNav > RISK_DEFAULTS.maxThemePctNav,
      };
    })
    .sort((a, b) => {
      if (a.overCap !== b.overCap) return a.overCap ? -1 : 1;
      if (b.weightPctNav !== a.weightPctNav) {
        return b.weightPctNav - a.weightPctNav;
      }
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
