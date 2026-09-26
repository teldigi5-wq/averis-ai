export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Generated from the live Averis Supabase project (lydepiaatemwpremgekt).
// Regenerate after schema changes so the frontend stays aligned with production.
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          credits_remaining: number;
          display_name: string | null;
          monthly_credit_allowance: number;
          plan: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_remaining?: number;
          display_name?: string | null;
          monthly_credit_allowance?: number;
          plan?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_remaining?: number;
          display_name?: string | null;
          monthly_credit_allowance?: number;
          plan?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      scans: {
        Row: {
          created_at: string;
          credits_used: number;
          document_name: string;
          id: string;
          original_file_retained: boolean;
          similarity_percent: number | null;
          source_name: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_used?: number;
          document_name: string;
          id?: string;
          original_file_retained?: boolean;
          similarity_percent?: number | null;
          source_name?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_used?: number;
          document_name?: string;
          id?: string;
          original_file_retained?: boolean;
          similarity_percent?: number | null;
          source_name?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_scan_credit: {
        Args: {
          p_document_name: string;
          p_similarity_percent: number;
          p_source_name: string;
        };
        Returns: {
          credits_remaining: number;
          scan_id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
