export type AssetClass = "equity" | "etf" | "commodity_proxy" | "other";

export type InstrumentStatus = "watchlist" | "active" | "archived";

export type SignalStatus = "new" | "reviewing" | "acted" | "dismissed";

export type SignalSource = "manual" | "scorer";

export type PositionStatus = "open" | "closed";

export type PositionSide = "long" | "short";

export type TransactionKind =
  | "deposit"
  | "withdrawal"
  | "buy"
  | "sell"
  | "dividend"
  | "interest"
  | "fee"
  | "adjustment";

export type DecisionType =
  | "enter"
  | "add"
  | "reduce"
  | "exit"
  | "hold"
  | "watch";

export type DocumentType =
  | "10-k"
  | "10-q"
  | "8-k"
  | "earnings"
  | "transcript"
  | "press"
  | "other";

export type DossierStatus =
  | "watch"
  | "investigate"
  | "active_thesis"
  | "passed";

export const DOSSIER_STATUSES: readonly DossierStatus[] = [
  "watch",
  "investigate",
  "active_thesis",
  "passed",
] as const;

export type DossierResearchLevel =
  | "draft"
  | "screened"
  | "primary_verified"
  | "investment_ready";

export const DOSSIER_RESEARCH_LEVELS: readonly DossierResearchLevel[] = [
  "draft",
  "screened",
  "primary_verified",
  "investment_ready",
] as const;

export function dossierResearchLevelLabel(
  level: DossierResearchLevel,
): string {
  switch (level) {
    case "draft":
      return "draft";
    case "screened":
      return "screened";
    case "primary_verified":
      return "primary verified";
    case "investment_ready":
      return "investment ready";
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export const DECISION_TYPES: readonly DecisionType[] = [
  "enter",
  "add",
  "reduce",
  "exit",
  "hold",
  "watch",
] as const;

export type PlannedActionType = "buy" | "add" | "reduce" | "sell";

export const PLANNED_ACTION_TYPES: readonly PlannedActionType[] = [
  "buy",
  "add",
  "reduce",
  "sell",
] as const;

export type PlannedActionStatus =
  | "pending"
  | "deferred"
  | "confirmed"
  | "cancelled";

export const PLANNED_ACTION_STATUSES: readonly PlannedActionStatus[] = [
  "pending",
  "deferred",
  "confirmed",
  "cancelled",
] as const;

export const OPEN_PLANNED_ACTION_STATUSES: readonly PlannedActionStatus[] = [
  "pending",
  "deferred",
] as const;

export interface Theme {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isCore: boolean;
  sortOrder: number;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string | null;
  currency: string;
  status: InstrumentStatus;
  notes: string | null;
}

export interface Signal {
  id: string;
  instrumentId: string | null;
  themeId: string | null;
  source: SignalSource;
  scorerKey: string | null;
  title: string;
  rationale: string;
  confidence: number | null;
  score: number | null;
  status: SignalStatus;
  payload: Record<string, unknown>;
  firedAt: string;
}

export interface Position {
  id: string;
  instrumentId: string;
  status: PositionStatus;
  side: PositionSide;
  quantity: number;
  avgCost: number;
  openedAt: string;
  closedAt: string | null;
  thesisSummary: string | null;
  invalidation: string | null;
}

export interface Decision {
  id: string;
  instrumentId: string | null;
  positionId: string | null;
  signalId: string | null;
  decisionType: DecisionType;
  thesis: string;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  sizingRationale: string | null;
  actionAt: string;
  outcomeNotes: string | null;
  outcomeGrade: string | null;
  reviewedAt: string | null;
}
