import type { AdminClient } from "@/lib/supabase/admin";
import type { AttemptRow, GroupRow, RoundRow } from "@/lib/supabase/types";
import { getGame } from "@/games";
import { gameLimits, type GameResult } from "@/games/types";
import { abandonStale, groupToday } from "./rounds";
import type { DateString } from "./time";

// Antitrampas del brief: el intento se consume al empezar, no al terminar.
// /start crea el attempt in_progress y devuelve la semilla; /finish valida
// tiempo, cotas y traza, y recién ahí guarda el puntaje. Un intento que se
// rechaza o que queda colgado más de 5 minutos pasa a abandoned y no vuelve.

export class AttemptError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface StartResult {
  attemptId: string;
  attemptNumber: number;
  attemptsLeft: number;
  seed: string;
  gameId: string;
  durationMs: number;
}

async function loadRoundAndGroup(admin: AdminClient, roundId: string): Promise<{ round: RoundRow; group: GroupRow }> {
  const { data: round, error } = await admin.from("rounds").select("*").eq("id", roundId).maybeSingle();
  if (error) throw new Error(`rounds: ${error.message}`);
  if (!round) throw new AttemptError(404, "round_not_found", "esa ronda no existe.");
  const { data: group, error: gErr } = await admin.from("groups").select("*").eq("id", round.group_id).maybeSingle();
  if (gErr) throw new Error(`groups: ${gErr.message}`);
  if (!group) throw new AttemptError(404, "group_not_found", "ese grupo no existe.");
  return { round, group };
}

async function assertMember(admin: AdminClient, groupId: string, userId: string) {
  const { data, error } = await admin
    .from("group_members")
    .select("profile_id")
    .eq("group_id", groupId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw new Error(`group_members: ${error.message}`);
  if (!data) throw new AttemptError(403, "not_member", "no sos parte de este grupo.");
}

/** Intentos usados por un jugador en una ronda (todos los estados cuentan). */
export async function attemptsUsed(admin: AdminClient, roundId: string, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("attempts")
    .select("attempt_number")
    .eq("round_id", roundId)
    .eq("profile_id", userId);
  if (error) throw new Error(`attempts: ${error.message}`);
  return (data ?? []).reduce((m, a) => Math.max(m, a.attempt_number), 0);
}

export async function startAttempt(
  admin: AdminClient,
  userId: string,
  roundId: string,
  opts: { now?: Date; fakeToday?: DateString | null } = {},
): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const { round, group } = await loadRoundAndGroup(admin, roundId);
  await assertMember(admin, group.id, userId);

  const game = getGame(round.game_id);
  if (!game) throw new AttemptError(500, "unknown_game", `el juego ${round.game_id} no está en el registry.`);

  // no se puede jugar una ronda pasada (ni futura)
  if (round.play_date !== groupToday(group, opts.fakeToday)) {
    throw new AttemptError(409, "round_closed", "esa ronda ya cerró. hoy hay otro juego.");
  }

  await abandonStale(admin, round.id, now);

  // iniciar un intento nuevo abandona cualquier intento propio en curso (decisión 9)
  const { error: abandonErr } = await admin
    .from("attempts")
    .update({ status: "abandoned" })
    .eq("round_id", round.id)
    .eq("profile_id", userId)
    .eq("status", "in_progress");
  if (abandonErr) throw new Error(`abandonar: ${abandonErr.message}`);

  // dos reintentos por si dos pedidos del mismo usuario se cruzan en el unique
  for (let i = 0; i < 2; i++) {
    const used = await attemptsUsed(admin, round.id, userId);
    if (used >= group.max_attempts) {
      throw new AttemptError(409, "no_attempts_left", "te quedaste sin intentos por hoy. mañana hay revancha.");
    }
    const { data, error } = await admin
      .from("attempts")
      .insert({ round_id: round.id, profile_id: userId, attempt_number: used + 1, started_at: now.toISOString() })
      .select()
      .single();
    if (error?.code === "23505") continue;
    if (error || !data) throw new Error(`crear intento: ${error?.message ?? "sin fila"}`);
    return {
      attemptId: data.id,
      attemptNumber: data.attempt_number,
      attemptsLeft: group.max_attempts - data.attempt_number,
      seed: round.seed,
      gameId: round.game_id,
      durationMs: game.durationMs,
    };
  }
  throw new AttemptError(409, "conflict", "hubo un cruce al empezar. probá de nuevo.");
}

export interface FinishResult {
  attemptId: string;
  score: number;
  elapsedMs: number;
}

export async function finishAttempt(
  admin: AdminClient,
  userId: string,
  attemptId: string,
  body: unknown,
  opts: { now?: Date } = {},
): Promise<FinishResult> {
  const now = opts.now ?? new Date();

  const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", attemptId).maybeSingle();
  if (error) throw new Error(`attempts: ${error.message}`);
  if (!attempt) throw new AttemptError(404, "attempt_not_found", "ese intento no existe.");
  if (attempt.profile_id !== userId) throw new AttemptError(403, "not_yours", "ese intento no es tuyo.");
  if (attempt.status !== "in_progress") {
    throw new AttemptError(409, "already_finished", "ese intento ya terminó.");
  }

  const { round } = await loadRoundAndGroup(admin, attempt.round_id);
  const game = getGame(round.game_id);
  if (!game) throw new AttemptError(500, "unknown_game", `el juego ${round.game_id} no está en el registry.`);
  const limits = gameLimits(game);

  const reject = async (code: string, message: string) => {
    // un intento rechazado se pierde igual: no se devuelve
    await admin.from("attempts").update({ status: "abandoned" }).eq("id", attempt.id).eq("status", "in_progress");
    return new AttemptError(422, code, message);
  };

  const elapsedMs = now.getTime() - Date.parse(attempt.started_at);
  if (elapsedMs < limits.minDurationMs || elapsedMs > limits.maxDurationMs) {
    throw await reject("bad_duration", "la partida duró un tiempo que no cierra. el intento se perdió.");
  }

  const result = parseResult(body);
  if (!result) throw await reject("bad_body", "el resultado llegó mal armado. el intento se perdió.");
  if (result.score < limits.minScore || result.score > limits.maxScore) {
    throw await reject("implausible_score", "ese puntaje no es posible. el intento se perdió.");
  }
  if (game.validate && !game.validate(result, round.seed)) {
    throw await reject("invalid_events", "la partida no pasó la validación. el intento se perdió.");
  }

  const { data: updated, error: upErr } = await admin
    .from("attempts")
    .update({ status: "completed", score: result.score, finished_at: now.toISOString() })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select();
  if (upErr) throw new Error(`guardar intento: ${upErr.message}`);
  if (!updated || updated.length === 0) throw new AttemptError(409, "already_finished", "ese intento ya terminó.");

  return { attemptId: attempt.id, score: result.score, elapsedMs };
}

function parseResult(body: unknown): GameResult | null {
  if (!body || typeof body !== "object") return null;
  const { score, events } = body as { score?: unknown; events?: unknown };
  if (typeof score !== "number" || !Number.isInteger(score)) return null;
  if (!Array.isArray(events)) return null;
  return { score, events };
}

export type { AttemptRow };
