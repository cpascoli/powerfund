export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      themes: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          is_core: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          is_core?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          is_core?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      instruments: {
        Row: {
          id: string;
          symbol: string;
          name: string;
          asset_class: "equity" | "etf" | "commodity_proxy" | "other";
          exchange: string | null;
          currency: string;
          status: "watchlist" | "active" | "archived";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          name: string;
          asset_class?: "equity" | "etf" | "commodity_proxy" | "other";
          exchange?: string | null;
          currency?: string;
          status?: "watchlist" | "active" | "archived";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          name?: string;
          asset_class?: "equity" | "etf" | "commodity_proxy" | "other";
          exchange?: string | null;
          currency?: string;
          status?: "watchlist" | "active" | "archived";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      instrument_themes: {
        Row: {
          instrument_id: string;
          theme_id: string;
          is_primary: boolean;
        };
        Insert: {
          instrument_id: string;
          theme_id: string;
          is_primary?: boolean;
        };
        Update: {
          instrument_id?: string;
          theme_id?: string;
          is_primary?: boolean;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          instrument_id: string | null;
          source: string;
          external_id: string | null;
          doc_type:
            | "10-k"
            | "10-q"
            | "8-k"
            | "earnings"
            | "transcript"
            | "press"
            | "other";
          title: string;
          filed_at: string | null;
          url: string | null;
          raw_metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          instrument_id?: string | null;
          source: string;
          external_id?: string | null;
          doc_type?:
            | "10-k"
            | "10-q"
            | "8-k"
            | "earnings"
            | "transcript"
            | "press"
            | "other";
          title: string;
          filed_at?: string | null;
          url?: string | null;
          raw_metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          instrument_id?: string | null;
          source?: string;
          external_id?: string | null;
          doc_type?:
            | "10-k"
            | "10-q"
            | "8-k"
            | "earnings"
            | "transcript"
            | "press"
            | "other";
          title?: string;
          filed_at?: string | null;
          url?: string | null;
          raw_metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      signals: {
        Row: {
          id: string;
          instrument_id: string | null;
          theme_id: string | null;
          source: "manual" | "scorer";
          scorer_key: string | null;
          title: string;
          rationale: string;
          confidence: number | null;
          score: number | null;
          status: "new" | "reviewing" | "acted" | "dismissed";
          payload: Json;
          fired_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          instrument_id?: string | null;
          theme_id?: string | null;
          source?: "manual" | "scorer";
          scorer_key?: string | null;
          title: string;
          rationale: string;
          confidence?: number | null;
          score?: number | null;
          status?: "new" | "reviewing" | "acted" | "dismissed";
          payload?: Json;
          fired_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          instrument_id?: string | null;
          theme_id?: string | null;
          source?: "manual" | "scorer";
          scorer_key?: string | null;
          title?: string;
          rationale?: string;
          confidence?: number | null;
          score?: number | null;
          status?: "new" | "reviewing" | "acted" | "dismissed";
          payload?: Json;
          fired_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          instrument_id: string;
          status: "open" | "closed";
          side: "long" | "short";
          quantity: number;
          avg_cost: number;
          opened_at: string;
          closed_at: string | null;
          thesis_summary: string | null;
          invalidation: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          instrument_id: string;
          status?: "open" | "closed";
          side?: "long" | "short";
          quantity: number;
          avg_cost: number;
          opened_at?: string;
          closed_at?: string | null;
          thesis_summary?: string | null;
          invalidation?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          instrument_id?: string;
          status?: "open" | "closed";
          side?: "long" | "short";
          quantity?: number;
          avg_cost?: number;
          opened_at?: string;
          closed_at?: string | null;
          thesis_summary?: string | null;
          invalidation?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      decisions: {
        Row: {
          id: string;
          instrument_id: string | null;
          position_id: string | null;
          signal_id: string | null;
          decision_type:
            | "enter"
            | "add"
            | "reduce"
            | "exit"
            | "hold"
            | "watch";
          thesis: string;
          catalysts: string | null;
          risks: string | null;
          invalidation: string | null;
          sizing_rationale: string | null;
          action_at: string;
          outcome_notes: string | null;
          outcome_grade: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          instrument_id?: string | null;
          position_id?: string | null;
          signal_id?: string | null;
          decision_type:
            | "enter"
            | "add"
            | "reduce"
            | "exit"
            | "hold"
            | "watch";
          thesis: string;
          catalysts?: string | null;
          risks?: string | null;
          invalidation?: string | null;
          sizing_rationale?: string | null;
          action_at?: string;
          outcome_notes?: string | null;
          outcome_grade?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          instrument_id?: string | null;
          position_id?: string | null;
          signal_id?: string | null;
          decision_type?:
            | "enter"
            | "add"
            | "reduce"
            | "exit"
            | "hold"
            | "watch";
          thesis?: string;
          catalysts?: string | null;
          risks?: string | null;
          invalidation?: string | null;
          sizing_rationale?: string | null;
          action_at?: string;
          outcome_notes?: string | null;
          outcome_grade?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      portfolio_snapshots: {
        Row: {
          id: string;
          as_of: string;
          nav: number;
          cash: number;
          notes: string | null;
          exposures: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          as_of: string;
          nav: number;
          cash: number;
          notes?: string | null;
          exposures?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          as_of?: string;
          nav?: number;
          cash?: number;
          notes?: string | null;
          exposures?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      dossiers: {
        Row: {
          id: string;
          instrument_id: string;
          status: "watch" | "investigate" | "active_thesis" | "passed";
          summary: string;
          thesis: string | null;
          catalysts: string | null;
          risks: string | null;
          invalidation: string | null;
          competitive_notes: string | null;
          next_diligence: string | null;
          source: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          instrument_id: string;
          status?: "watch" | "investigate" | "active_thesis" | "passed";
          summary: string;
          thesis?: string | null;
          catalysts?: string | null;
          risks?: string | null;
          invalidation?: string | null;
          competitive_notes?: string | null;
          next_diligence?: string | null;
          source?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          instrument_id?: string;
          status?: "watch" | "investigate" | "active_thesis" | "passed";
          summary?: string;
          thesis?: string | null;
          catalysts?: string | null;
          risks?: string | null;
          invalidation?: string | null;
          competitive_notes?: string | null;
          next_diligence?: string | null;
          source?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      asset_class: "equity" | "etf" | "commodity_proxy" | "other";
      instrument_status: "watchlist" | "active" | "archived";
      signal_status: "new" | "reviewing" | "acted" | "dismissed";
      signal_source: "manual" | "scorer";
      position_status: "open" | "closed";
      position_side: "long" | "short";
      decision_type: "enter" | "add" | "reduce" | "exit" | "hold" | "watch";
      dossier_status: "watch" | "investigate" | "active_thesis" | "passed";
      document_type:
        | "10-k"
        | "10-q"
        | "8-k"
        | "earnings"
        | "transcript"
        | "press"
        | "other";
    };
    CompositeTypes: Record<string, never>;
  };
};
