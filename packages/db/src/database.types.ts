export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          action_at: string
          catalysts: string | null
          created_at: string
          decision_type: Database["public"]["Enums"]["decision_type"]
          id: string
          instrument_id: string | null
          invalidation: string | null
          outcome_grade: string | null
          outcome_notes: string | null
          position_id: string | null
          reviewed_at: string | null
          risks: string | null
          signal_id: string | null
          sizing_rationale: string | null
          thesis: string
        }
        Insert: {
          action_at?: string
          catalysts?: string | null
          created_at?: string
          decision_type: Database["public"]["Enums"]["decision_type"]
          id?: string
          instrument_id?: string | null
          invalidation?: string | null
          outcome_grade?: string | null
          outcome_notes?: string | null
          position_id?: string | null
          reviewed_at?: string | null
          risks?: string | null
          signal_id?: string | null
          sizing_rationale?: string | null
          thesis: string
        }
        Update: {
          action_at?: string
          catalysts?: string | null
          created_at?: string
          decision_type?: Database["public"]["Enums"]["decision_type"]
          id?: string
          instrument_id?: string | null
          invalidation?: string | null
          outcome_grade?: string | null
          outcome_notes?: string | null
          position_id?: string | null
          reviewed_at?: string | null
          risks?: string | null
          signal_id?: string | null
          sizing_rationale?: string | null
          thesis?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["document_type"]
          external_id: string | null
          filed_at: string | null
          id: string
          instrument_id: string | null
          raw_metadata: Json
          source: string
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          external_id?: string | null
          filed_at?: string | null
          id?: string
          instrument_id?: string | null
          raw_metadata?: Json
          source: string
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          external_id?: string | null
          filed_at?: string | null
          id?: string
          instrument_id?: string | null
          raw_metadata?: Json
          source?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          catalysts: string | null
          competitive_notes: string | null
          created_at: string
          id: string
          instrument_id: string
          invalidation: string | null
          next_diligence: string | null
          risks: string | null
          source: string | null
          status: Database["public"]["Enums"]["dossier_status"]
          summary: string
          thesis: string | null
          updated_at: string
        }
        Insert: {
          catalysts?: string | null
          competitive_notes?: string | null
          created_at?: string
          id?: string
          instrument_id: string
          invalidation?: string | null
          next_diligence?: string | null
          risks?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["dossier_status"]
          summary: string
          thesis?: string | null
          updated_at?: string
        }
        Update: {
          catalysts?: string | null
          competitive_notes?: string | null
          created_at?: string
          id?: string
          instrument_id?: string
          invalidation?: string | null
          next_diligence?: string | null
          risks?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["dossier_status"]
          summary?: string
          thesis?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: true
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamentals_quarterly: {
        Row: {
          capex: number | null
          currency: string
          fiscal_period: string | null
          free_cash_flow: number | null
          ingested_at: string
          instrument_id: string
          net_debt: number | null
          period_end: string
          raw: Json
          revenue: number | null
          shares_diluted: number | null
          source: string
        }
        Insert: {
          capex?: number | null
          currency?: string
          fiscal_period?: string | null
          free_cash_flow?: number | null
          ingested_at?: string
          instrument_id: string
          net_debt?: number | null
          period_end: string
          raw?: Json
          revenue?: number | null
          shares_diluted?: number | null
          source: string
        }
        Update: {
          capex?: number | null
          currency?: string
          fiscal_period?: string | null
          free_cash_flow?: number | null
          ingested_at?: string
          instrument_id?: string
          net_debt?: number | null
          period_end?: string
          raw?: Json
          revenue?: number | null
          shares_diluted?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundamentals_quarterly_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_themes: {
        Row: {
          instrument_id: string
          is_primary: boolean
          theme_id: string
        }
        Insert: {
          instrument_id: string
          is_primary?: boolean
          theme_id: string
        }
        Update: {
          instrument_id?: string
          is_primary?: boolean
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instrument_themes_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_themes_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          asset_class: Database["public"]["Enums"]["asset_class"]
          created_at: string
          currency: string
          exchange: string | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["instrument_status"]
          symbol: string
          updated_at: string
        }
        Insert: {
          asset_class?: Database["public"]["Enums"]["asset_class"]
          created_at?: string
          currency?: string
          exchange?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["instrument_status"]
          symbol: string
          updated_at?: string
        }
        Update: {
          asset_class?: Database["public"]["Enums"]["asset_class"]
          created_at?: string
          currency?: string
          exchange?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["instrument_status"]
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_bars: {
        Row: {
          adj_close: number | null
          bar_date: string
          close: number | null
          high: number | null
          ingested_at: string
          instrument_id: string
          low: number | null
          open: number | null
          source: string
          volume: number | null
        }
        Insert: {
          adj_close?: number | null
          bar_date: string
          close?: number | null
          high?: number | null
          ingested_at?: string
          instrument_id: string
          low?: number | null
          open?: number | null
          source: string
          volume?: number | null
        }
        Update: {
          adj_close?: number | null
          bar_date?: string
          close?: number | null
          high?: number | null
          ingested_at?: string
          instrument_id?: string
          low?: number | null
          open?: number | null
          source?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_bars_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      market_caps: {
        Row: {
          as_of_date: string
          ingested_at: string
          instrument_id: string
          market_cap: number
          source: string
        }
        Insert: {
          as_of_date: string
          ingested_at?: string
          instrument_id: string
          market_cap: number
          source: string
        }
        Update: {
          as_of_date?: string
          ingested_at?: string
          instrument_id?: string
          market_cap?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_caps_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["planned_action_type"]
          confirmed_at: string | null
          confirmed_price: number | null
          confirmed_quantity: number | null
          created_at: string
          decision_id: string | null
          due_by: string | null
          id: string
          instrument_id: string
          planned_usd: number
          position_id: string | null
          rationale: string | null
          status: Database["public"]["Enums"]["planned_action_status"]
          updated_at: string
          window_label: string | null
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["planned_action_type"]
          confirmed_at?: string | null
          confirmed_price?: number | null
          confirmed_quantity?: number | null
          created_at?: string
          decision_id?: string | null
          due_by?: string | null
          id?: string
          instrument_id: string
          planned_usd: number
          position_id?: string | null
          rationale?: string | null
          status?: Database["public"]["Enums"]["planned_action_status"]
          updated_at?: string
          window_label?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["planned_action_type"]
          confirmed_at?: string | null
          confirmed_price?: number | null
          confirmed_quantity?: number | null
          created_at?: string
          decision_id?: string | null
          due_by?: string | null
          id?: string
          instrument_id?: string
          planned_usd?: number
          position_id?: string | null
          rationale?: string | null
          status?: Database["public"]["Enums"]["planned_action_status"]
          updated_at?: string
          window_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_actions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_actions_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_actions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_snapshots: {
        Row: {
          as_of: string
          cash: number
          created_at: string
          exposures: Json
          id: string
          invested: number
          nav: number
          notes: string | null
          positions_value: number
          snapshot_date: string | null
        }
        Insert: {
          as_of: string
          cash: number
          created_at?: string
          exposures?: Json
          id?: string
          invested?: number
          nav: number
          notes?: string | null
          positions_value?: number
          snapshot_date?: string | null
        }
        Update: {
          as_of?: string
          cash?: number
          created_at?: string
          exposures?: Json
          id?: string
          invested?: number
          nav?: number
          notes?: string | null
          positions_value?: number
          snapshot_date?: string | null
        }
        Relationships: []
      }
      portfolio_state: {
        Row: {
          cash: number
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          cash: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          cash?: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_cost: number
          closed_at: string | null
          created_at: string
          id: string
          instrument_id: string
          invalidation: string | null
          opened_at: string
          quantity: number
          side: Database["public"]["Enums"]["position_side"]
          status: Database["public"]["Enums"]["position_status"]
          thesis_summary: string | null
          updated_at: string
        }
        Insert: {
          avg_cost: number
          closed_at?: string | null
          created_at?: string
          id?: string
          instrument_id: string
          invalidation?: string | null
          opened_at?: string
          quantity: number
          side?: Database["public"]["Enums"]["position_side"]
          status?: Database["public"]["Enums"]["position_status"]
          thesis_summary?: string | null
          updated_at?: string
        }
        Update: {
          avg_cost?: number
          closed_at?: string | null
          created_at?: string
          id?: string
          instrument_id?: string
          invalidation?: string | null
          opened_at?: string
          quantity?: number
          side?: Database["public"]["Enums"]["position_side"]
          status?: Database["public"]["Enums"]["position_status"]
          thesis_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          confidence: number | null
          created_at: string
          fired_at: string
          id: string
          instrument_id: string | null
          payload: Json
          rationale: string
          score: number | null
          scorer_key: string | null
          source: Database["public"]["Enums"]["signal_source"]
          status: Database["public"]["Enums"]["signal_status"]
          theme_id: string | null
          title: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          fired_at?: string
          id?: string
          instrument_id?: string | null
          payload?: Json
          rationale: string
          score?: number | null
          scorer_key?: string | null
          source?: Database["public"]["Enums"]["signal_source"]
          status?: Database["public"]["Enums"]["signal_status"]
          theme_id?: string | null
          title: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          fired_at?: string
          id?: string
          instrument_id?: string | null
          payload?: Json
          rationale?: string
          score?: number | null
          scorer_key?: string | null
          source?: Database["public"]["Enums"]["signal_source"]
          status?: Database["public"]["Enums"]["signal_status"]
          theme_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_core: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_core?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          basis_delta: number | null
          cash_delta: number
          created_at: string
          currency: string
          decision_id: string | null
          external_id: string | null
          fees: number
          id: string
          instrument_id: string | null
          kind: Database["public"]["Enums"]["transaction_kind"]
          mandate_override_reason: string | null
          notes: string | null
          occurred_at: string
          planned_action_id: string | null
          price: number | null
          quantity: number | null
          realized_pnl: number | null
          source: string
        }
        Insert: {
          basis_delta?: number | null
          cash_delta: number
          created_at?: string
          currency?: string
          decision_id?: string | null
          external_id?: string | null
          fees?: number
          id?: string
          instrument_id?: string | null
          kind: Database["public"]["Enums"]["transaction_kind"]
          mandate_override_reason?: string | null
          notes?: string | null
          occurred_at: string
          planned_action_id?: string | null
          price?: number | null
          quantity?: number | null
          realized_pnl?: number | null
          source?: string
        }
        Update: {
          basis_delta?: number | null
          cash_delta?: number
          created_at?: string
          currency?: string
          decision_id?: string | null
          external_id?: string | null
          fees?: number
          id?: string
          instrument_id?: string | null
          kind?: Database["public"]["Enums"]["transaction_kind"]
          mandate_override_reason?: string | null
          notes?: string | null
          occurred_at?: string
          planned_action_id?: string | null
          price?: number | null
          quantity?: number | null
          realized_pnl?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_planned_action_id_fkey"
            columns: ["planned_action_id"]
            isOneToOne: false
            referencedRelation: "planned_actions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_operator: { Args: never; Returns: boolean }
      verify_book_against_ledger: {
        Args: never
        Returns: {
          actual: number
          check_name: string
          expected: number
          ok: boolean
        }[]
      }
    }
    Enums: {
      app_role: "operator" | "viewer"
      asset_class: "equity" | "etf" | "commodity_proxy" | "other"
      decision_type: "enter" | "add" | "reduce" | "exit" | "hold" | "watch"
      document_type:
        | "10-k"
        | "10-q"
        | "8-k"
        | "earnings"
        | "transcript"
        | "press"
        | "other"
      dossier_status: "watch" | "investigate" | "active_thesis" | "passed"
      instrument_status: "watchlist" | "active" | "archived"
      planned_action_status: "pending" | "deferred" | "confirmed" | "cancelled"
      planned_action_type: "buy" | "add" | "reduce" | "sell"
      position_side: "long" | "short"
      position_status: "open" | "closed"
      signal_source: "manual" | "scorer"
      signal_status: "new" | "reviewing" | "acted" | "dismissed"
      transaction_kind:
        | "deposit"
        | "withdrawal"
        | "buy"
        | "sell"
        | "dividend"
        | "interest"
        | "fee"
        | "adjustment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["operator", "viewer"],
      asset_class: ["equity", "etf", "commodity_proxy", "other"],
      decision_type: ["enter", "add", "reduce", "exit", "hold", "watch"],
      document_type: [
        "10-k",
        "10-q",
        "8-k",
        "earnings",
        "transcript",
        "press",
        "other",
      ],
      dossier_status: ["watch", "investigate", "active_thesis", "passed"],
      instrument_status: ["watchlist", "active", "archived"],
      planned_action_status: ["pending", "deferred", "confirmed", "cancelled"],
      planned_action_type: ["buy", "add", "reduce", "sell"],
      position_side: ["long", "short"],
      position_status: ["open", "closed"],
      signal_source: ["manual", "scorer"],
      signal_status: ["new", "reviewing", "acted", "dismissed"],
      transaction_kind: [
        "deposit",
        "withdrawal",
        "buy",
        "sell",
        "dividend",
        "interest",
        "fee",
        "adjustment",
      ],
    },
  },
} as const
