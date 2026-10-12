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
  /** grupo de prueba: el panel de admin lo puede limpiar con todo lo suyo */
  is_test: boolean;
  created_at: string;
}

export type GameSettingRow = {
  game_id: string;
  enabled: boolean;
  updated_at: string;
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

export const ADMIN_ACTIONS = [
  "set_game",
  "reset_to_deck",
  "delete_group",
  "delete_user",
  "cleanup_test",
  "delete_orphans",
  "remove_member",
  "change_owner",
  "reset_season",
  "toggle_game",
  "push_test",
  "push_announce",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export type AdminActionRow = {
  id: string;
  admin_email: string;
  action: AdminAction;
  /** null si la acción no es sobre un grupo, o si el grupo se borró después */
  group_id: string | null;
  play_date: string | null;
  from_game_id: string | null;
  to_game_id: string | null;
  deleted_attempts: number;
  /** sobre qué fue: el nombre del grupo o del usuario, o el id del juego */
  target: string | null;
  /** el detalle: qué se borró y cuántas filas de cada tabla, a quién fue el aviso… */
  details: Json;
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
        // sin escritura desde el cliente salvo estas columnas (ver RLS); is_test solo la toca el admin con service_role
        Insert: Record<string, never>;
        Update: Partial<Pick<GroupRow, "name" | "timezone" | "max_attempts" | "reminder_time" | "is_test">>;
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
      // solo el servidor con service_role (RLS sin políticas)
      admin_actions: {
        Row: AdminActionRow;
        Insert: Partial<AdminActionRow> & Pick<AdminActionRow, "admin_email" | "action">;
        Update: Partial<AdminActionRow>;
        Relationships: [];
      };
      game_settings: {
        Row: GameSettingRow;
        Insert: Partial<GameSettingRow> & Pick<GameSettingRow, "game_id">;
        Update: Partial<GameSettingRow>;
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
      admin_set_today_game: {
        Args: { p_group_id: string; p_season_id: string; p_play_date: string; p_game_id: string; p_seed: string; p_admin_email: string; p_action: string };
        Returns: { o_round_id: string; o_from_game_id: string | null; o_deleted: number }[];
      };
      // administración general (migración 8): solo service_role; devuelven jsonb
      admin_groups_extra: {
        Args: Record<string, never>;
        Returns: { group_id: string; season_number: number | null; season_starts: string | null; season_ends: string | null; last_activity: string | null }[];
      };
      admin_group_detail: {
        Args: { p_group_id: string };
        Returns: Json;
      };
      admin_users_overview: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_delete_group: {
        Args: { p_group_id: string; p_delete_orphans: boolean; p_admin_emails: string[]; p_admin_email: string; p_dry_run: boolean };
        Returns: Json;
      };
      admin_delete_user: {
        Args: { p_profile_id: string; p_admin_emails: string[]; p_admin_email: string; p_dry_run: boolean };
        Returns: Json;
      };
      admin_cleanup_test: {
        Args: { p_admin_emails: string[]; p_admin_email: string; p_dry_run: boolean };
        Returns: Json;
      };
      admin_delete_orphans: {
        Args: { p_admin_emails: string[]; p_admin_email: string; p_dry_run: boolean };
        Returns: Json;
      };
      admin_remove_member: {
        Args: { p_group_id: string; p_profile_id: string; p_admin_email: string; p_dry_run: boolean };
        Returns: Json;
      };
      admin_change_owner: {
        Args: { p_group_id: string; p_profile_id: string; p_admin_email: string };
        Returns: Json;
      };
      admin_reset_season: {
        Args: { p_group_id: string; p_today: string; p_admin_email: string; p_dry_run: boolean };
        Returns: Json;
      };
      admin_toggle_game: {
        Args: { p_game_id: string; p_enabled: boolean; p_registry: string[]; p_admin_email: string };
        Returns: Json;
      };
      admin_log: {
        Args: { p_admin_email: string; p_action: string; p_group_id: string | null; p_target: string | null; p_details: Json };
        Returns: string;
      };
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
      invite_preview: {
        Args: { p_code: string };
        Returns: { total: number; members: { name: string; avatar: unknown }[] };
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
