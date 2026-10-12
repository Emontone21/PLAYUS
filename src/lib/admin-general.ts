import type { AdminClient } from "@/lib/supabase/admin";
import type { AdminActionRow, GroupRow, Json, RoundRow } from "@/lib/supabase/types";
import { GAME_IDS, GAMES, getGame } from "@/games";
import { parseAvatar, type Avatar } from "@/avatar/schema";
import { AdminActionError, loadGroupsOverview, type GroupOverview } from "./admin-actions";
import { filterGroups, filterUsers, type UserAdminRow, type UserFilter } from "./admin-filters";
import { adminEmails } from "./admin-identity";
import { disabledGameIds } from "./game-settings";
import { groupToday } from "./rounds";
import { daysBetween, type DateString } from "./time";

// Administración general del panel (decisiones 278 a 283): grupos, usuarios,
// integrantes, temporadas, juegos en rotación y el registro. Cada acción que
// modifica es una función de la base (migración 8) que corre en una sola
// transacción; con dryRun calcula la vista previa con los mismos conteos y no
// toca nada. Todas reciben el cliente con la clave de servicio: las páginas y
// los endpoints ya comprobaron el permiso.

// ---------------------------------------------------------------------------
// errores de las funciones de la base → códigos y textos del panel
// ---------------------------------------------------------------------------

const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  group_not_found: { status: 404, message: "ese grupo no existe." },
  user_not_found: { status: 404, message: "ese usuario no existe." },
  admin_protected: { status: 403, message: "al admin no se lo puede borrar." },
  is_owner: { status: 409, message: "es dueño de un grupo: antes pasale la propiedad a otro integrante o borrá ese grupo." },
  not_member: { status: 400, message: "esa persona no está en el grupo." },
  already_owner: { status: 400, message: "ya es el dueño." },
  no_season: { status: 400, message: "este grupo todavía no tiene temporada." },
  last_game: { status: 409, message: "tiene que quedar al menos un juego en la rotación." },
};

async function rpcJson<T>(admin: AdminClient, what: string, call: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await call;
  if (error) {
    const known = RPC_ERRORS[error.message];
    if (known) throw new AdminActionError(known.status, error.message, known.message);
    throw new Error(`${what}: ${error.message}`);
  }
  return data as T;
}

const emails = () => adminEmails();

export { filterGroups, filterUsers };
export type { UserAdminRow, UserFilter };

// ---------------------------------------------------------------------------
// grupos
// ---------------------------------------------------------------------------

export interface SeasonInfo {
  number: number;
  startsOn: DateString;
  endsOn: DateString | null;
  /** el día de hoy dentro de la temporada, desde 1 */
  day: number;
}

export interface GroupAdminRow extends GroupOverview {
  season: SeasonInfo | null;
  lastActivity: string;
  createdAt: string;
}

function seasonInfo(number: number | null, startsOn: string | null, endsOn: string | null, today: DateString): SeasonInfo | null {
  if (number === null || !startsOn) return null;
  return { number, startsOn, endsOn, day: Math.max(0, daysBetween(startsOn, today)) + 1 };
}

/** todos los grupos con lo del panel original más la marca, la temporada y la última actividad */
export async function loadGroupsAdmin(admin: AdminClient, fakeToday?: DateString | null): Promise<GroupAdminRow[]> {
  const [overview, extra, { data: groups, error }] = await Promise.all([
    loadGroupsOverview(admin, fakeToday),
    rpcJson<{ group_id: string; season_number: number | null; season_starts: string | null; season_ends: string | null; last_activity: string | null }[]>(admin, "admin_groups_extra", admin.rpc("admin_groups_extra")),
    admin.from("groups").select("id, created_at"),
  ]);
  if (error) throw new Error(`groups: ${error.message}`);
  const extraOf = new Map(extra.map((e) => [e.group_id, e]));
  const createdOf = new Map((groups ?? []).map((g) => [g.id, g.created_at]));
  return overview.map((g) => {
    const e = extraOf.get(g.id);
    const createdAt = createdOf.get(g.id) ?? new Date(0).toISOString();
    return { ...g, season: seasonInfo(e?.season_number ?? null, e?.season_starts ?? null, e?.season_ends ?? null, g.today), lastActivity: e?.last_activity ?? createdAt, createdAt };
  });
}

export interface GroupMemberAdmin {
  profileId: string;
  /** el nombre en el grupo: apodo o nombre visible */
  name: string;
  displayName: string;
  nickname: string | null;
  avatar: Avatar;
  role: "owner" | "member";
  joinedAt: string;
  hasEmail: boolean;
  /** partidas completadas en la temporada actual */
  played: number;
}

export interface GroupSeasonAdmin {
  id: string;
  number: number;
  startsOn: DateString;
  endsOn: DateString | null;
  closedAt: string | null;
  winnerProfileId: string | null;
  rounds: number;
  attempts: number;
}

export interface GroupDetail {
  group: GroupRow;
  today: DateString;
  round: { id: string; gameId: string; gameName: string } | null;
  members: GroupMemberAdmin[];
  seasons: GroupSeasonAdmin[];
  currentSeason: SeasonInfo | null;
}

type DetailJson = {
  members: { profile_id: string; display_name: string; nickname: string | null; avatar: Json; role: "owner" | "member"; joined_at: string; has_email: boolean; played: number }[];
  seasons: { id: string; number: number; starts_on: string; ends_on: string | null; closed_at: string | null; winner_profile_id: string | null; rounds: number; attempts: number }[];
  current_season: { number: number; starts_on: string; ends_on: string | null } | null;
};

/** el detalle de un grupo para el panel, o null si no existe */
export async function loadGroupDetail(admin: AdminClient, groupId: string, fakeToday?: DateString | null): Promise<GroupDetail | null> {
  const { data: group, error } = await admin.from("groups").select("*").eq("id", groupId).maybeSingle();
  if (error) throw new Error(`groups: ${error.message}`);
  if (!group) return null;
  const today = groupToday(group, fakeToday);
  const [detail, { data: round }] = await Promise.all([
    rpcJson<DetailJson>(admin, "admin_group_detail", admin.rpc("admin_group_detail", { p_group_id: groupId })),
    admin.from("rounds").select("*").eq("group_id", groupId).eq("play_date", today).maybeSingle(),
  ]);
  const r = round as RoundRow | null;
  return {
    group,
    today,
    round: r ? { id: r.id, gameId: r.game_id, gameName: getGame(r.game_id)?.name ?? r.game_id } : null,
    members: detail.members.map((m) => ({
      profileId: m.profile_id,
      name: m.nickname?.trim() || m.display_name || "alguien",
      displayName: m.display_name,
      nickname: m.nickname,
      avatar: parseAvatar(m.avatar),
      role: m.role,
      joinedAt: m.joined_at,
      hasEmail: m.has_email,
      played: m.played,
    })),
    seasons: detail.seasons.map((s) => ({ id: s.id, number: s.number, startsOn: s.starts_on, endsOn: s.ends_on, closedAt: s.closed_at, winnerProfileId: s.winner_profile_id, rounds: s.rounds, attempts: s.attempts })),
    currentSeason: seasonInfo(detail.current_season?.number ?? null, detail.current_season?.starts_on ?? null, detail.current_season?.ends_on ?? null, today),
  };
}

/** marca o desmarca un grupo como de prueba */
export async function setGroupTest(admin: AdminClient, groupId: string, isTest: boolean): Promise<GroupRow> {
  const { data, error } = await admin.from("groups").update({ is_test: isTest }).eq("id", groupId).select().maybeSingle();
  if (error) throw new Error(`groups: ${error.message}`);
  if (!data) throw new AdminActionError(404, "group_not_found", "ese grupo no existe.");
  return data;
}

// ---------------------------------------------------------------------------
// vistas previas: cada acción destructiva devuelve los conteos exactos que va a
// borrar; el panel los muestra antes de pedir la confirmación escrita
// ---------------------------------------------------------------------------

export interface Preview {
  /** qué se va a borrar, con cantidades */
  lines: string[];
  /** si toca grupos no marcados como prueba, el aviso */
  warning: string | null;
  /** si no se puede hacer, por qué (con links si corresponde) */
  blocked: { text: string; links: { href: string; label: string }[] } | null;
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const names = (xs: { name: string }[]) => xs.map((x) => x.name || "(sin nombre)").join(", ");

export interface GroupRef {
  id: string;
  name: string;
  is_test: boolean;
}
export interface DeleteGroupResult {
  group: GroupRef;
  members: number;
  seasons: number;
  rounds: number;
  attempts: number;
  orphans: { id: string; name: string }[];
  delete_orphans: boolean;
  deleted_users: number;
}

export function describeDeleteGroup(r: DeleteGroupResult): Preview {
  const lines = [`se borra el grupo "${r.group.name}" con ${n(r.members, "integrante", "integrantes")}, ${n(r.seasons, "temporada", "temporadas")}, ${n(r.rounds, "ronda", "rondas")} y ${n(r.attempts, "intento", "intentos")}.`];
  if (r.delete_orphans) {
    lines.push(r.orphans.length === 0 ? "ningún usuario queda sin grupo: no se borra a nadie." : `también se borra a ${n(r.orphans.length, "usuario que queda sin ningún grupo", "usuarios que quedan sin ningún grupo")}: ${names(r.orphans)}.`);
  } else if (r.orphans.length > 0) {
    lines.push(`${n(r.orphans.length, "usuario queda", "usuarios quedan")} sin ningún grupo y no se borran: ${names(r.orphans)}.`);
  }
  return { lines, warning: r.group.is_test ? null : `ojo: "${r.group.name}" no está marcado como de prueba.`, blocked: null };
}

export interface DeleteUserResult {
  user: { id: string; name: string; email: string | null };
  groups: { id: string; name: string; role: "owner" | "member"; is_test: boolean }[];
  owner_of: { id: string; name: string }[];
  memberships: number;
  attempts: number;
  push: number;
}

export function describeDeleteUser(r: DeleteUserResult): Preview {
  const who = r.user.name || "(sin nombre)";
  const lines = [`se borra a ${who}${r.user.email ? ` (${r.user.email})` : " (anónimo)"} con su perfil, ${n(r.memberships, "membresía", "membresías")}, ${n(r.attempts, "intento", "intentos")} y ${n(r.push, "suscripción de avisos", "suscripciones de avisos")}.`];
  if (r.groups.length > 0) lines.push(`sale de: ${names(r.groups)}.`);
  const real = r.groups.filter((g) => !g.is_test);
  const blocked = r.owner_of.length > 0 ? { text: `${who} es dueño de ${names(r.owner_of)}: antes pasale la propiedad a otro integrante o borrá ese grupo.`, links: r.owner_of.map((g) => ({ href: `/admin/grupos/${g.id}`, label: g.name })) } : null;
  return { lines, warning: real.length > 0 ? `ojo: está en ${n(real.length, "grupo no marcado", "grupos no marcados")} como de prueba: ${names(real)}.` : null, blocked };
}

export interface CleanupResult {
  groups: { id: string; name: string; members: number }[];
  users: { id: string; name: string }[];
  members: number;
  seasons: number;
  rounds: number;
  attempts: number;
  deleted_groups: number;
  deleted_users: number;
}

export function describeCleanup(r: CleanupResult): Preview {
  if (r.groups.length === 0) return { lines: ["no hay grupos marcados como de prueba."], warning: null, blocked: { text: "no hay nada para limpiar.", links: [] } };
  const lines = [
    `se borran ${n(r.groups.length, "grupo de prueba", "grupos de prueba")}: ${r.groups.map((g) => `"${g.name}" (${n(g.members, "integrante", "integrantes")})`).join(", ")}.`,
    `en total, ${n(r.members, "integrante", "integrantes")}, ${n(r.seasons, "temporada", "temporadas")}, ${n(r.rounds, "ronda", "rondas")} y ${n(r.attempts, "intento", "intentos")}.`,
    r.users.length === 0 ? "ningún usuario queda sin grupo: no se borra a nadie." : `después se borra a ${n(r.users.length, "usuario que queda sin ningún grupo", "usuarios que quedan sin ningún grupo")}: ${names(r.users)}. al admin nunca.`,
  ];
  return { lines, warning: null, blocked: null };
}

export interface OrphansResult {
  users: { id: string; name: string }[];
  attempts: number;
  push: number;
  deleted_users: number;
}

export function describeOrphans(r: OrphansResult): Preview {
  if (r.users.length === 0) return { lines: ["no hay usuarios sin grupo (sin contar al admin)."], warning: null, blocked: { text: "no hay nada para borrar.", links: [] } };
  return { lines: [`se borra a ${n(r.users.length, "usuario sin grupo", "usuarios sin grupo")}: ${names(r.users)}.`, `con ${n(r.attempts, "intento", "intentos")} y ${n(r.push, "suscripción de avisos", "suscripciones de avisos")}. al admin nunca.`], warning: null, blocked: null };
}

export interface RemoveMemberResult {
  group: GroupRef;
  member: { id: string; name: string; role: "owner" | "member" };
  season_number: number | null;
  attempts: number;
}

export function describeRemoveMember(r: RemoveMemberResult): Preview {
  const lines = [`${r.member.name} sale de "${r.group.name}"${r.season_number ? ` y se borran sus ${n(r.attempts, "intento", "intentos")} de la temporada ${r.season_number}, así la tabla se recalcula sin esa persona` : ""}. las temporadas cerradas no se tocan.`];
  return { lines, warning: r.group.is_test ? null : `ojo: "${r.group.name}" no está marcado como de prueba.`, blocked: r.member.role === "owner" ? { text: "es el dueño: antes pasale la propiedad a otro integrante.", links: [] } : null };
}

export interface ChangeOwnerResult {
  group: GroupRef;
  from: { id: string | null; name: string | null };
  to: { id: string; name: string };
}

export interface ResetSeasonResult {
  group: GroupRef;
  season_number: number;
  starts_on_before: DateString;
  starts_on: DateString;
  ends_on: DateString;
  rounds: number;
  attempts: number;
}

export function describeResetSeason(r: ResetSeasonResult): Preview {
  return {
    lines: [`se borran ${n(r.rounds, "ronda", "rondas")} y ${n(r.attempts, "intento", "intentos")} de la temporada ${r.season_number} de "${r.group.name}", que vuelve a empezar hoy (${r.starts_on}) con el mismo número y termina el ${r.ends_on}. las temporadas cerradas, sus campeones y la corona no se tocan.`],
    warning: r.group.is_test ? null : `ojo: "${r.group.name}" no está marcado como de prueba.`,
    blocked: null,
  };
}

// ---------------------------------------------------------------------------
// acciones (cada una, una función de la base en una transacción)
// ---------------------------------------------------------------------------

export interface Who {
  adminEmail: string;
}

export async function deleteGroup(admin: AdminClient, opts: Who & { groupId: string; deleteOrphans: boolean; dryRun: boolean }): Promise<DeleteGroupResult> {
  return rpcJson<DeleteGroupResult>(admin, "borrar el grupo", admin.rpc("admin_delete_group", { p_group_id: opts.groupId, p_delete_orphans: opts.deleteOrphans, p_admin_emails: emails(), p_admin_email: opts.adminEmail, p_dry_run: opts.dryRun }));
}

export async function deleteUser(admin: AdminClient, opts: Who & { profileId: string; dryRun: boolean }): Promise<DeleteUserResult> {
  return rpcJson<DeleteUserResult>(admin, "borrar el usuario", admin.rpc("admin_delete_user", { p_profile_id: opts.profileId, p_admin_emails: emails(), p_admin_email: opts.adminEmail, p_dry_run: opts.dryRun }));
}

export async function cleanupTest(admin: AdminClient, opts: Who & { dryRun: boolean }): Promise<CleanupResult> {
  return rpcJson<CleanupResult>(admin, "limpiar los datos de prueba", admin.rpc("admin_cleanup_test", { p_admin_emails: emails(), p_admin_email: opts.adminEmail, p_dry_run: opts.dryRun }));
}

export async function deleteOrphans(admin: AdminClient, opts: Who & { dryRun: boolean }): Promise<OrphansResult> {
  return rpcJson<OrphansResult>(admin, "borrar los usuarios sin grupo", admin.rpc("admin_delete_orphans", { p_admin_emails: emails(), p_admin_email: opts.adminEmail, p_dry_run: opts.dryRun }));
}

export async function removeMember(admin: AdminClient, opts: Who & { groupId: string; profileId: string; dryRun: boolean }): Promise<RemoveMemberResult> {
  return rpcJson<RemoveMemberResult>(admin, "sacar al integrante", admin.rpc("admin_remove_member", { p_group_id: opts.groupId, p_profile_id: opts.profileId, p_admin_email: opts.adminEmail, p_dry_run: opts.dryRun }));
}

export async function changeOwner(admin: AdminClient, opts: Who & { groupId: string; profileId: string }): Promise<ChangeOwnerResult> {
  return rpcJson<ChangeOwnerResult>(admin, "cambiar el dueño", admin.rpc("admin_change_owner", { p_group_id: opts.groupId, p_profile_id: opts.profileId, p_admin_email: opts.adminEmail }));
}

export async function resetSeason(admin: AdminClient, opts: Who & { group: GroupRow; dryRun: boolean; fakeToday?: DateString | null }): Promise<ResetSeasonResult> {
  const today = groupToday(opts.group, opts.fakeToday);
  return rpcJson<ResetSeasonResult>(admin, "reiniciar la temporada", admin.rpc("admin_reset_season", { p_group_id: opts.group.id, p_today: today, p_admin_email: opts.adminEmail, p_dry_run: opts.dryRun }));
}

// ---------------------------------------------------------------------------
// usuarios
// ---------------------------------------------------------------------------

type UserJson = { id: string; display_name: string; avatar: Json; email: string | null; created_at: string; last_played: string | null; push: number; groups: { id: string; name: string; role: "owner" | "member"; is_test: boolean }[] };

/** todos los usuarios, del más nuevo al más viejo; nunca datos de la sesión ni tokens */
export async function loadUsersAdmin(admin: AdminClient): Promise<UserAdminRow[]> {
  const rows = await rpcJson<UserJson[]>(admin, "admin_users_overview", admin.rpc("admin_users_overview"));
  const admins = emails();
  return rows.map((u) => ({
    id: u.id,
    name: u.display_name,
    avatar: parseAvatar(u.avatar),
    email: u.email,
    createdAt: u.created_at,
    lastPlayed: u.last_played,
    push: u.push,
    groups: u.groups.map((g) => ({ id: g.id, name: g.name, role: g.role, isTest: g.is_test })),
    isAdmin: !!u.email && admins.includes(u.email.trim().toLowerCase()),
  }));
}

// ---------------------------------------------------------------------------
// juegos en rotación
// ---------------------------------------------------------------------------

export interface GameSettingRow {
  id: string;
  name: string;
  orientation: "portrait" | "landscape";
  enabled: boolean;
  durationMs: number;
}

export async function listGameSettings(admin: AdminClient): Promise<GameSettingRow[]> {
  const off = await disabledGameIds(admin);
  return GAME_IDS.map((id) => {
    const g = GAMES[id]!;
    return { id, name: g.name, orientation: g.orientation ?? "portrait", enabled: !off.has(id), durationMs: g.durationMs };
  });
}

export interface ToggleGameResult {
  game_id: string;
  enabled: boolean;
  enabled_count: number;
}

/** prende o apaga un juego de la rotación; no deja apagar el último */
export async function toggleGame(admin: AdminClient, opts: Who & { gameId: string; enabled: boolean }): Promise<ToggleGameResult> {
  if (!getGame(opts.gameId)) throw new AdminActionError(400, "unknown_game", "ese juego no está en el registro.");
  return rpcJson<ToggleGameResult>(admin, "cambiar la rotación", admin.rpc("admin_toggle_game", { p_game_id: opts.gameId, p_enabled: opts.enabled, p_registry: [...GAME_IDS], p_admin_email: opts.adminEmail }));
}

// ---------------------------------------------------------------------------
// registro
// ---------------------------------------------------------------------------

export const ACTION_LABELS: Record<AdminActionRow["action"], string> = {
  set_game: "cambió el juego de hoy",
  reset_to_deck: "volvió al juego del mazo",
  delete_group: "borró un grupo",
  delete_user: "borró un usuario",
  cleanup_test: "limpió los datos de prueba",
  delete_orphans: "borró a los usuarios sin grupo",
  remove_member: "sacó a un integrante",
  change_owner: "cambió el dueño",
  reset_season: "reinició la temporada",
  toggle_game: "cambió la rotación de juegos",
  push_test: "se mandó un aviso de prueba",
  push_announce: "mandó un anuncio",
};

export interface LogEntry {
  id: string;
  createdAt: string;
  action: AdminActionRow["action"];
  label: string;
  /** sobre qué: el grupo (link si existe), el usuario o el juego */
  target: string;
  groupId: string | null;
  adminEmail: string;
  /** el detalle, línea por línea */
  details: string[];
}

function detailLines(a: AdminActionRow): string[] {
  const d = (a.details && typeof a.details === "object" && !Array.isArray(a.details) ? a.details : {}) as Record<string, Json | undefined>;
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as { name?: string }[]).map((x) => x?.name ?? "").filter(Boolean) : []);
  const out: string[] = [];
  switch (a.action) {
    case "set_game":
    case "reset_to_deck":
      out.push(`${a.play_date ?? ""}: ${a.from_game_id ? `de ${getGame(a.from_game_id)?.name ?? a.from_game_id} ` : "ronda creada "}a ${getGame(a.to_game_id ?? "")?.name ?? a.to_game_id}${a.deleted_attempts > 0 ? `, ${a.deleted_attempts} intentos borrados` : ""}`);
      break;
    case "delete_group":
      out.push(`${num("members") ?? 0} integrantes, ${num("seasons") ?? 0} temporadas, ${num("rounds") ?? 0} rondas, ${num("attempts") ?? 0} intentos`);
      if ((num("deleted_users") ?? 0) > 0) out.push(`usuarios borrados: ${list("orphans").join(", ")}`);
      break;
    case "delete_user":
      out.push(`${num("memberships") ?? 0} membresías, ${num("attempts") ?? 0} intentos, ${num("push") ?? 0} suscripciones`);
      if (list("groups").length) out.push(`salió de: ${list("groups").join(", ")}`);
      break;
    case "cleanup_test":
      out.push(`grupos: ${list("groups").join(", ") || "ninguno"}`);
      out.push(`${num("members") ?? 0} integrantes, ${num("seasons") ?? 0} temporadas, ${num("rounds") ?? 0} rondas, ${num("attempts") ?? 0} intentos`);
      out.push(`usuarios borrados (${num("deleted_users") ?? 0}): ${list("users").join(", ") || "ninguno"}`);
      break;
    case "delete_orphans":
      out.push(`usuarios borrados (${num("deleted_users") ?? 0}): ${list("users").join(", ") || "ninguno"}`);
      out.push(`${num("attempts") ?? 0} intentos, ${num("push") ?? 0} suscripciones`);
      break;
    case "remove_member": {
      const m = d.member as { name?: string } | undefined;
      out.push(`${m?.name ?? "alguien"}: ${num("attempts") ?? 0} intentos de la temporada ${num("season_number") ?? "?"} borrados`);
      break;
    }
    case "change_owner": {
      const f = d.from as { name?: string } | undefined;
      const t = d.to as { name?: string } | undefined;
      out.push(`de ${f?.name ?? "?"} a ${t?.name ?? "?"}`);
      break;
    }
    case "reset_season":
      out.push(`temporada ${num("season_number") ?? "?"}: ${num("rounds") ?? 0} rondas y ${num("attempts") ?? 0} intentos borrados; empieza ${String(d.starts_on ?? "")}`);
      break;
    case "toggle_game":
      out.push(`${d.enabled ? "en rotación" : "fuera de la rotación"}; quedan ${num("enabled_count") ?? "?"} habilitados`);
      break;
    case "push_test":
      out.push(`${num("sent") ?? 0} enviadas, ${num("failed") ?? 0} fallidas, ${num("removed") ?? 0} vencidas borradas`);
      break;
    case "push_announce":
      out.push(`"${String(d.text ?? "")}" a ${String(d.to ?? "todos")}: ${num("recipients") ?? 0} personas, ${num("sent") ?? 0} enviadas, ${num("failed") ?? 0} fallidas, ${num("removed") ?? 0} vencidas borradas`);
      break;
  }
  return out;
}

/** las últimas acciones del registro, listas para mostrar */
export async function loadLog(admin: AdminClient, limit = 100): Promise<LogEntry[]> {
  const { data, error } = await admin.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`admin_actions: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.group_id).filter((x): x is string => !!x))];
  const { data: groups } = ids.length ? await admin.from("groups").select("id, name").in("id", ids) : { data: [] };
  const nameOf = new Map((groups ?? []).map((g) => [g.id, g.name]));
  return rows.map((a) => ({
    id: a.id,
    createdAt: a.created_at,
    action: a.action,
    label: ACTION_LABELS[a.action] ?? a.action,
    target: a.action === "toggle_game" ? (getGame(a.target ?? "")?.name ?? a.target ?? "") : ((a.group_id && nameOf.get(a.group_id)) ?? a.target ?? ""),
    groupId: a.group_id && nameOf.has(a.group_id) ? a.group_id : null,
    adminEmail: a.admin_email,
    details: detailLines(a),
  }));
}
