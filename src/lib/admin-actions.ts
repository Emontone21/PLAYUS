import type { AdminClient } from "@/lib/supabase/admin";
import type { AdminActionRow, GroupRow, RoundRow } from "@/lib/supabase/types";
import { GAME_IDS, getGame } from "@/games";
import { gameLimits, type GameResult } from "@/games/types";
import { gameForDay, roundSeed } from "./deck";
import { ensureSeason, groupToday } from "./rounds";
import { daysBetween, type DateString } from "./time";

// Lo que hace el panel de admin, con la clave de servicio y después de
// comprobar el permiso (eso lo hacen las páginas y los endpoints). Todas las
// funciones reciben el cliente: los tests las corren contra la base local.

/** la opción "el que toca en el mazo" del selector */
export const DECK = "deck";

export interface GroupOverview {
  id: string;
  name: string;
  inviteCode: string;
  timezone: string;
  members: number;
  /** la fecha de hoy del grupo, en su zona horaria */
  today: DateString;
  /** la ronda de hoy, si ya se creó */
  round: { id: string; gameId: string; gameName: string } | null;
  /** intentos de hoy, en cualquier estado, y de cuántas personas */
  attempts: number;
  people: number;
}

/** todos los grupos con su hoy, su juego de hoy y sus intentos */
export async function loadGroupsOverview(admin: AdminClient, fakeToday?: DateString | null): Promise<GroupOverview[]> {
  const { data: groups, error } = await admin.from("groups").select("*").order("name");
  if (error) throw new Error(`groups: ${error.message}`);
  const list = groups ?? [];
  if (list.length === 0) return [];
  const ids = list.map((g) => g.id);
  const [{ data: members, error: mErr }, { data: rounds, error: rErr }] = await Promise.all([
    admin.from("group_members").select("group_id").in("group_id", ids),
    admin.from("rounds").select("*").in("group_id", ids).order("play_date", { ascending: false }),
  ]);
  if (mErr) throw new Error(`group_members: ${mErr.message}`);
  if (rErr) throw new Error(`rounds: ${rErr.message}`);
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1);
  const todayOf = new Map(list.map((g) => [g.id, groupToday(g, fakeToday)]));
  const todayRound = new Map<string, RoundRow>();
  for (const r of rounds ?? []) if (r.play_date === todayOf.get(r.group_id) && !todayRound.has(r.group_id)) todayRound.set(r.group_id, r);
  const roundIds = [...todayRound.values()].map((r) => r.id);
  const { data: attempts, error: aErr } = roundIds.length ? await admin.from("attempts").select("round_id, profile_id").in("round_id", roundIds) : { data: [], error: null };
  if (aErr) throw new Error(`attempts: ${aErr.message}`);
  const attemptsOf = new Map<string, { n: number; people: Set<string> }>();
  for (const a of attempts ?? []) {
    const e = attemptsOf.get(a.round_id) ?? { n: 0, people: new Set<string>() };
    e.n++;
    e.people.add(a.profile_id);
    attemptsOf.set(a.round_id, e);
  }
  return list.map((g) => {
    const r = todayRound.get(g.id);
    const a = r ? attemptsOf.get(r.id) : undefined;
    return {
      id: g.id,
      name: g.name,
      inviteCode: g.invite_code,
      timezone: g.timezone,
      members: memberCount.get(g.id) ?? 0,
      today: todayOf.get(g.id)!,
      round: r ? { id: r.id, gameId: r.game_id, gameName: getGame(r.game_id)?.name ?? r.game_id } : null,
      attempts: a?.n ?? 0,
      people: a?.people.size ?? 0,
    };
  });
}

export interface SetGameResult {
  roundId: string;
  playDate: DateString;
  fromGameId: string | null;
  toGameId: string;
  deletedAttempts: number;
  action: "set_game" | "reset_to_deck";
}

export class AdminActionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** el juego que le toca a ese día según el mazo de la temporada */
export function deckGameFor(group: GroupRow, season: { number: number; starts_on: string }, today: DateString): string {
  const dayIndex = Math.max(0, daysBetween(season.starts_on, today));
  return gameForDay(group.id, season.number, dayIndex, GAME_IDS);
}

/**
 * Cambia el juego de hoy de un grupo (o lo vuelve al del mazo). Solo el día
 * de hoy del grupo, en su zona horaria. En una transacción (RPC): si la ronda
 * no existe la crea; si existe, borra todos sus intentos (en cualquier estado),
 * cambia el juego y recalcula la semilla con la fórmula de siempre; y deja
 * registro en admin_actions. El mazo no se reacomoda (decisión 237).
 */
export async function setTodayGame(
  admin: AdminClient,
  opts: { group: GroupRow; gameId: string; adminEmail: string; fakeToday?: DateString | null },
): Promise<SetGameResult> {
  const { group, adminEmail } = opts;
  const today = groupToday(group, opts.fakeToday);
  const season = await ensureSeason(admin, group, today);
  const reset = opts.gameId === DECK;
  const toGameId = reset ? deckGameFor(group, season, today) : opts.gameId;
  if (!getGame(toGameId)) throw new AdminActionError(400, "unknown_game", "ese juego no está en el registro.");
  const seed = roundSeed(group.id, today, toGameId);
  const action = reset ? "reset_to_deck" : "set_game";
  const { data, error } = await admin.rpc("admin_set_today_game", {
    p_group_id: group.id,
    p_season_id: season.id,
    p_play_date: today,
    p_game_id: toGameId,
    p_seed: seed,
    p_admin_email: adminEmail,
    p_action: action,
  });
  if (error) throw new Error(`cambiar el juego de hoy: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new Error("cambiar el juego de hoy: la función no devolvió nada");
  return { roundId: row.o_round_id, playDate: today, fromGameId: row.o_from_game_id, toGameId, deletedAttempts: row.o_deleted, action };
}

/** los últimos cambios, con el nombre del grupo */
export async function recentAdminActions(admin: AdminClient, limit = 20): Promise<(AdminActionRow & { groupName: string })[]> {
  const { data, error } = await admin.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`admin_actions: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.group_id))];
  const { data: groups } = ids.length ? await admin.from("groups").select("id, name").in("id", ids) : { data: [] };
  const names = new Map((groups ?? []).map((g) => [g.id, g.name]));
  return rows.map((r) => ({ ...r, groupName: names.get(r.group_id) ?? "(grupo borrado)" }));
}

// ---------------------------------------------------------------------------
// probar juegos: validar como lo haría /finish, sin tocar la base
// ---------------------------------------------------------------------------

export interface AdminValidation {
  valid: boolean;
  /** por qué no pasó, si no pasó */
  reason: string | null;
  score: number;
  /** el puntaje que el juego recalcula desde la traza, si sabe hacerlo */
  recomputed: number | null;
  elapsedMs: number;
  events: number;
  bytes: number;
}

function parseResult(body: unknown): GameResult | null {
  if (!body || typeof body !== "object") return null;
  const { score, events } = body as { score?: unknown; events?: unknown };
  if (typeof score !== "number" || !Number.isInteger(score)) return null;
  if (!Array.isArray(events)) return null;
  return { score, events };
}

/** corre las mismas comprobaciones que /finish (duración, cotas y validate) sobre una partida de prueba */
export async function validateForAdmin(gameId: string, seed: string, body: unknown, elapsedMs: number): Promise<AdminValidation> {
  const game = getGame(gameId);
  if (!game) throw new AdminActionError(400, "unknown_game", "ese juego no existe.");
  const result = parseResult(body);
  if (!result) throw new AdminActionError(400, "bad_body", "el resultado no llegó bien.");
  const limits = gameLimits(game);
  const base = { score: result.score, elapsedMs, events: result.events.length, bytes: new TextEncoder().encode(JSON.stringify(result.events)).length };
  let recomputed: number | null = null;
  try {
    recomputed = game.recomputeScore ? game.recomputeScore(result, seed) : null;
  } catch {
    recomputed = null;
  }
  if (elapsedMs < limits.minDurationMs || elapsedMs > limits.maxDurationMs) {
    return { ...base, valid: false, recomputed, reason: `la duración (${(elapsedMs / 1000).toFixed(1)} s) queda fuera de ${(limits.minDurationMs / 1000).toFixed(1)} a ${(limits.maxDurationMs / 1000).toFixed(1)} s` };
  }
  if (result.score < limits.minScore || result.score > limits.maxScore) {
    return { ...base, valid: false, recomputed, reason: `el puntaje ${result.score} queda fuera de las cotas ${limits.minScore} a ${limits.maxScore}` };
  }
  if (game.validate && !(await game.validate(result, seed, { elapsedMs }))) {
    return { ...base, valid: false, recomputed, reason: recomputed !== null && recomputed !== result.score ? `validate rechazó la traza: recalcula ${recomputed} y el juego informó ${result.score}` : "validate rechazó la traza" };
  }
  return { ...base, valid: true, recomputed, reason: null };
}
