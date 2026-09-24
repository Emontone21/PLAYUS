// Tipos de la base, escritos a mano a partir de supabase/migrations.
// Cuando haya un Supabase local con Docker se pueden regenerar con
// `npx supabase gen types typescript --local > src/lib/supabase/types.ts`
// y comparar.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "owner" | "member";
export type AttemptStatus = "in_progress" | "completed" | "abandoned";

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar: Json;
  created_at: string;
}

export type GroupRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  timezone: string;
  max_attempts: number;
  /** hora local del grupo "HH:MM:SS" del recordatorio; null = sin recordatorio */
  reminder_time: string | null;
  created_at: string;
}

export type PushSubscriptionRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export type GroupReminderRow = {
  group_id: string;
  play_date: string;
  sent_at: string;
  sent_count: number;
}

export type GroupMemberRow = {
  group_id: string;
  profile_id: string;
  role: MemberRole;
  nickname: string | null;
  joined_at: string;
}

export type SeasonRow = {
  id: string;
  group_id: string;
  number: number;
  starts_on: string;
  ends_on: string | null;
  winner_profile_id: string | null;
  closed_at: string | null;
}

export type RoundRow = {
  id: string;
  group_id: string;
  season_id: string;
  play_date: string;
  game_id: string;
  seed: string;
  created_at: string;
}

export type AttemptRow = {
  id: string;
  round_id: string;
  profile_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  finished_at: string | null;
  score: number | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        // sin escritura desde el cliente salvo estas columnas (ver RLS)
        Insert: Record<string, never>;
        Update: Partial<Pick<GroupRow, "name" | "timezone" | "max_attempts" | "reminder_time">>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: Record<string, never>;
        Update: Partial<Pick<GroupMemberRow, "nickname">>;
        Relationships: [];
      };
      // seasons, rounds y attempts: el cliente solo lee (RLS + privilegios).
      // Los Insert/Update los usa el servidor con service_role.
      seasons: {
        Row: SeasonRow;
        Insert: Partial<SeasonRow> & Pick<SeasonRow, "group_id" | "number" | "starts_on">;
        Update: Partial<SeasonRow>;
        Relationships: [];
      };
      rounds: {
        Row: RoundRow;
        Insert: Partial<RoundRow> & Pick<RoundRow, "group_id" | "season_id" | "play_date" | "game_id" | "seed">;
        Update: Partial<RoundRow>;
        Relationships: [];
      };
      attempts: {
        Row: AttemptRow;
        Insert: Partial<AttemptRow> & Pick<AttemptRow, "round_id" | "profile_id" | "attempt_number">;
        Update: Partial<AttemptRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Partial<PushSubscriptionRow> & Pick<PushSubscriptionRow, "profile_id" | "endpoint" | "p256dh" | "auth">;
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      group_reminders: {
        Row: GroupReminderRow;
        Insert: Partial<GroupReminderRow> & Pick<GroupReminderRow, "group_id" | "play_date">;
        Update: Partial<GroupReminderRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_group: {
        Args: { p_name: string; p_timezone?: string };
        Returns: GroupRow;
      };
      join_group: {
        Args: { p_code: string };
        Returns: GroupRow;
      };
      round_participants: {
        Args: { p_round_id: string };
        Returns: { profile_id: string; completed_attempts: number }[];
      };
      is_member: {
        Args: { p_group_id: string };
        Returns: boolean;
      };
      group_today: {
        Args: { p_group_id: string };
        Returns: string;
      };
      can_view_round_scores: {
        Args: { p_round_id: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
