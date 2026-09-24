import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, GroupRow } from "@/lib/supabase/types";
import { ensureRound, ensureSeason, closeSeason, seasonStandings } from "./rounds";
import { startAttempt, finishAttempt, AttemptError, attemptsUsed } from "./attempts";
import { getGame } from "@/games";
import { gameLimits } from "@/games/types";
import { addDays, todayInTz } from "./time";
import { waitsForSeed } from "@/games/reflejo";

// Consumo de intentos contra la base local (Supabase real o el emulador
// scripts/mini-supabase). Corre solo si hay un stack en SUPABASE_TEST_URL
// (default http://127.0.0.1:54321); si no responde, se saltea.

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";

async function stackUp(): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/auth/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function keys() {
  const jwt = await import("jsonwebtoken");
  const sign = (role: string) => jwt.default.sign({ iss: "supabase", role, iat: 1700000000, exp: 2000000000 }, SECRET);
  return { anon: process.env.SUPABASE_TEST_ANON_KEY ?? sign("anon"), service: process.env.SUPABASE_TEST_SERVICE_KEY ?? sign("service_role") };
}

const up = await stackUp();

describe.skipIf(!up)("intentos contra la base local", () => {
  let admin: SupabaseClient<Database>;
  let userA: string;
  let userB: string;
  let group: GroupRow;

  beforeAll(async () => {
    const k = await keys();
    admin = createClient<Database>(URL, k.service, { auth: { persistSession: false } });
    const a = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const b = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const { data: sa } = await a.auth.signInAnonymously();
    const { data: sb } = await b.auth.signInAnonymously();
    userA = sa.user!.id;
    userB = sb.user!.id;
    const { data: g, error } = await a.rpc("create_group", { p_name: "test intentos" });
    if (error) throw error;
    group = g;
    const { error: jErr } = await b.rpc("join_group", { p_code: group.invite_code });
    if (jErr) throw jErr;
  });

  it("crea la ronda de hoy una sola vez, con juego del registry y semilla", async () => {
    const today = todayInTz(group.timezone);
    const r1 = await ensureRound(admin, group, today);
    const r2 = await ensureRound(admin, group, today);
    expect(r2.id).toBe(r1.id);
    expect(getGame(r1.game_id)).toBeDefined();
    expect(r1.seed).toMatch(/^[0-9a-f]{8}$/);
    expect(r1.play_date).toBe(today);
  });

  it("consume el intento al empezar, no al terminar; recargar a mitad de partida lo cuesta", async () => {
    const today = todayInTz(group.timezone);
    const round = await ensureRound(admin, group, today);

    const s1 = await startAttempt(admin, userA, round.id);
    expect(s1.attemptNumber).toBe(1);
    expect(s1.attemptsLeft).toBe(group.max_attempts - 1);
    expect(s1.seed).toBe(round.seed);

    // "recargar": no se termina el intento 1 y se arranca otro
    const s2 = await startAttempt(admin, userA, round.id);
    expect(s2.attemptNumber).toBe(2);
    const { data: first } = await admin.from("attempts").select("status").eq("id", s1.attemptId).single();
    expect(first?.status).toBe("abandoned");
    expect(await attemptsUsed(admin, round.id, userA)).toBe(2);

    // terminar el intento 1 ya no se puede
    await expect(finishAttempt(admin, userA, s1.attemptId, { score: 1, events: [] })).rejects.toMatchObject({
      code: "already_finished",
    });
  });

  it("rechaza tiempo fuera de rango y puntajes imposibles, y el intento se pierde", async () => {
    const today = todayInTz(group.timezone);
    const round = await ensureRound(admin, group, today);
    const game = getGame(round.game_id)!;
    const limits = gameLimits(game);

    const s = await startAttempt(admin, userB, round.id);
    const startedAt = Date.parse((await admin.from("attempts").select("started_at").eq("id", s.attemptId).single()).data!.started_at);

    // demasiado rápido
    await expect(
      finishAttempt(admin, userB, s.attemptId, validResult(game.id, round.seed, 5), {
        now: new Date(startedAt + limits.minDurationMs - 1000),
      }),
    ).rejects.toMatchObject({ code: "bad_duration" });
    const { data: after } = await admin.from("attempts").select("status").eq("id", s.attemptId).single();
    expect(after?.status).toBe("abandoned");

    // puntaje imposible
    const s2 = await startAttempt(admin, userB, round.id);
    const started2 = Date.parse((await admin.from("attempts").select("started_at").eq("id", s2.attemptId).single()).data!.started_at);
    await expect(
      finishAttempt(admin, userB, s2.attemptId, { score: limits.maxScore + 1, events: [] }, { now: new Date(started2 + limits.minDurationMs + 500) }),
    ).rejects.toMatchObject({ code: "implausible_score" });

    // demasiado lento (más de durationMs + 10 s)
    const s3 = await startAttempt(admin, userB, round.id);
    const started3 = Date.parse((await admin.from("attempts").select("started_at").eq("id", s3.attemptId).single()).data!.started_at);
    await expect(
      finishAttempt(admin, userB, s3.attemptId, validResult(game.id, round.seed, 5), { now: new Date(started3 + limits.maxDurationMs + 1) }),
    ).rejects.toMatchObject({ code: "bad_duration" });

    // se fueron los tres
    await expect(startAttempt(admin, userB, round.id)).rejects.toMatchObject({ code: "no_attempts_left" });
  });

  it("guarda un intento válido, no lo deja terminar dos veces, y no acepta intentos ajenos", async () => {
    const today = todayInTz(group.timezone);
    const round = await ensureRound(admin, group, today);
    const game = getGame(round.game_id)!;
    const limits = gameLimits(game);

    const s = await startAttempt(admin, userA, round.id); // el 3º de A
    const startedAt = Date.parse((await admin.from("attempts").select("started_at").eq("id", s.attemptId).single()).data!.started_at);
    const now = new Date(startedAt + limits.minDurationMs + 500);

    await expect(finishAttempt(admin, userB, s.attemptId, validResult(game.id, round.seed, 7), { now })).rejects.toMatchObject({
      code: "not_yours",
    });

    const ok = await finishAttempt(admin, userA, s.attemptId, validResult(game.id, round.seed, 7), { now });
    expect(ok.score).toBeGreaterThan(0);
    const { data: saved } = await admin.from("attempts").select("status, score").eq("id", s.attemptId).single();
    expect(saved).toMatchObject({ status: "completed", score: ok.score });

    await expect(finishAttempt(admin, userA, s.attemptId, validResult(game.id, round.seed, 7), { now })).rejects.toMatchObject({
      code: "already_finished",
    });
    await expect(startAttempt(admin, userA, round.id)).rejects.toMatchObject({ code: "no_attempts_left" });
  });

  it("no deja jugar una ronda pasada", async () => {
    const yesterday = addDays(todayInTz(group.timezone), -1);
    const round = await ensureRound(admin, group, yesterday);
    await expect(startAttempt(admin, userA, round.id)).rejects.toMatchObject({ code: "round_closed" });
  });

  it("cierra la temporada y marca campeón cuando pasa la fecha", async () => {
    const today = todayInTz(group.timezone);
    const season = await ensureSeason(admin, group, today);
    const closed = await closeSeason(admin, season);
    expect(closed.closed_at).not.toBeNull();
    const table = await seasonStandings(admin, season);
    expect(closed.winner_profile_id).toBe(table[0]?.profileId ?? null);
    // el día siguiente al cierre abre la temporada 2
    const next = await ensureSeason(admin, group, addDays(season.ends_on!, 1));
    expect(next.number).toBe(season.number + 1);
  });

  it("un intento colgado más de 5 minutos queda abandoned al empezar otro", async () => {
    const c = createClient<Database>(URL, (await keys()).anon, { auth: { persistSession: false } });
    const { data: sc } = await c.auth.signInAnonymously();
    await c.rpc("join_group", { p_code: group.invite_code });
    const userC = sc.user!.id;
    const round = await ensureRound(admin, group, todayInTz(group.timezone));
    const past = new Date(Date.now() - 6 * 60 * 1000);
    const s = await startAttempt(admin, userC, round.id, { now: past });
    await startAttempt(admin, userC, round.id);
    const { data } = await admin.from("attempts").select("status").eq("id", s.attemptId).single();
    expect(data?.status).toBe("abandoned");
  });
});

// Un resultado que pasa validate() del juego de la ronda.
function validResult(gameId: string, seed: string, n: number) {
  if (gameId === "tap-race") {
    return { score: n, events: Array.from({ length: n }, (_, i) => i * 100) };
  }
  if (gameId === "reflejo") {
    const waits = waitsForSeed(seed);
    const events = waits.map((waitMs, round) => ({ round, waitMs, reactionMs: 200 + round * 10, falseStarts: 0 }));
    const score = Math.round(events.reduce((s, e) => s + e.reactionMs, 0) / events.length);
    return { score, events };
  }
  throw new Error(`sin resultado válido para ${gameId}`);
}

export { AttemptError };
