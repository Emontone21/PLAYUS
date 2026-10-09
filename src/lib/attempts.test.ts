import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, GroupRow } from "@/lib/supabase/types";
import { ensureRound, ensureSeason, closeSeason, seasonStandings } from "./rounds";
import { startAttempt, finishAttempt, AttemptError, attemptsUsed } from "./attempts";
import { getGame } from "@/games";
import { gameLimits } from "@/games/types";
import { addDays, todayInTz } from "./time";
import { attemptSeed, roundSeed, seedProfile } from "./deck";
import { seedPepper } from "./seed-pepper";
import { legitTrace } from "@/games/piba-del-ipa/rules";
import { humanTrace, scoreFor } from "@/games/quedo-re-tarado/rules";
import { greedyTrace } from "@/games/los-deseos-de-larry/rules";
import { soberTrace } from "@/games/remar-vuelve-a-casa/rules";
import { safeTrace as parrillaTrace } from "@/games/la-parrilla-del-bro/rules";
import { canarioTimeline } from "@/games/la-parrilla-del-bro/timeline";
import { playedTrace as jotaTrace } from "@/games/pegandole-al-jota/rules";
import { jotaRounds } from "@/games/pegandole-al-jota/rounds";
import { perfectTrace as caminandoTrace } from "@/games/caminando-por-18/rules";
import { greedyTrace as rastasTrace } from "@/games/rastitas-rastotas/rules";
import { autoTrace as sunnyTrace } from "@/games/pisteando-el-sunny/rules";
import { honestTrace as parisTrace } from "@/games/busca-los-paris/rules";
import { autoTrace as colgadoTrace } from "@/games/colgado-del-121/rules";
import { generatePlan as torrePlan, simulate as torreSimulate, swayX as torreSwayX } from "@/games/apila-las-boludeces/rules";
import { loadRapier, type Rapier } from "@/games/apila-las-boludeces/physics";
import { loadSeasonSeries } from "@/lib/season-series";
import { botTrace as mayoTrace } from "@/games/la-mayo/rules";
import { botTrace as servilaTrace, simulate as servilaSimulate } from "@/games/servila-justa/rules";
import { botTrace as chinoTrace } from "@/games/fumate-algo-chino/rules";
import { botTrace as claseTrace } from "@/games/clase-con-el-bro/rules";
import { botTrace as hdpTrace, simulate as hdpSimulate } from "@/games/hdp/rules";
import { botTrace as larryHdpTrace } from "@/games/larry-en-la-hdp/rules";
import { botTrace as afilaTrace } from "@/games/big-bro-afila/rules";
import { botTrace as nachSaltaTrace } from "@/games/nach-salta/rules";
import { botTrace as cruzaTrace } from "@/games/cruza-con-el-chino/rules";
import { botTrace as ranaTrace } from "@/games/cazando-colillas/rules";
import { botTrace as tragoTrace, MODEL as tragoModel } from "@/games/dale-un-trago-al-pibe/rules";
import { botTrace as sacaTrace, MODEL as sacaModel } from "@/games/saca-el-sunny/rules";
import { botTrace as barakaTrace, MODEL as barakaModel } from "@/games/barakatututu/rules";
import { botTrace as bolsitaTrace } from "@/games/la-bolsita-del-jota/rules";
import { parseAvatar } from "@/avatar/schema";
import { mulberry32 } from "@/lib/rng";

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
    torreR = await loadRapier();
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

  it("la gráfica de la temporada: un integrante la lee; alguien de otro grupo no ve nada (RLS)", async () => {
    const today = todayInTz(group.timezone);
    const season = await ensureSeason(admin, group, today);
    const members = new Map([
      [userA, { profileId: userA, name: "A", avatar: parseAvatar(null) }],
      [userB, { profileId: userB, name: "B", avatar: parseAvatar(null) }],
    ]);
    const k = await keys();
    // un integrante nuevo, con su propia sesión
    const asA = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const { data: sa } = await asA.auth.signInAnonymously();
    const { error: jErr } = await asA.rpc("join_group", { p_code: group.invite_code });
    if (jErr) throw jErr;
    members.set(sa.user!.id, { profileId: sa.user!.id, name: "C", avatar: parseAvatar(null) });
    const mine = await loadSeasonSeries(asA, group, season, members, today);
    expect(mine.days.length).toBe(30);
    expect(mine.series.some((x) => x.profileId === sa.user!.id)).toBe(true);
    // un cliente que no es del grupo: ni rondas ni integrantes (RLS); la gráfica queda vacía
    const stranger = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    await stranger.auth.signInAnonymously();
    const theirs = await loadSeasonSeries(stranger, group, season, members, today);
    expect(theirs.series).toEqual([]);
    expect(theirs.standings).toEqual([]);
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
    // la semilla es por intento, no la de la ronda
    expect(s1.seed).not.toBe(round.seed);
    expect(s1.seed).toBe(attemptSeed(round.seed, 1, seedPepper(), seedProfile(getGame(round.game_id)!, userA)));

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
      finishAttempt(admin, userB, s.attemptId, validResult(game.id, s.seed, 5), {
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
      finishAttempt(admin, userB, s3.attemptId, validResult(game.id, s3.seed, 5), { now: new Date(started3 + limits.maxDurationMs + 1) }),
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
    const r7 = validResult(game.id, s.seed, 7);
    const now = new Date(startedAt + Math.max(limits.minDurationMs + 500, r7.elapsedMs ?? 0));

    await expect(finishAttempt(admin, userB, s.attemptId, r7, { now })).rejects.toMatchObject({
      code: "not_yours",
    });

    const ok = await finishAttempt(admin, userA, s.attemptId, r7, { now });
    expect(ok.score).toBeGreaterThan(0);
    const { data: saved } = await admin.from("attempts").select("status, score").eq("id", s.attemptId).single();
    expect(saved).toMatchObject({ status: "completed", score: ok.score });

    await expect(finishAttempt(admin, userA, s.attemptId, r7, { now })).rejects.toMatchObject({
      code: "already_finished",
    });
    await expect(startAttempt(admin, userA, round.id)).rejects.toMatchObject({ code: "no_attempts_left" });
  });

  it("la semilla es por intento: igual para dos jugadores en el mismo número, distinta entre intentos, y solo la da start", async () => {
    // grupo aparte con dos personas nuevas, para no depender de los intentos gastados arriba
    const k = await keys();
    const c = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const d = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const userC = (await c.auth.signInAnonymously()).data.user!.id;
    const userD = (await d.auth.signInAnonymously()).data.user!.id;
    const { data: g2, error } = await c.rpc("create_group", { p_name: "test semillas" });
    if (error) throw error;
    const { error: jErr } = await d.rpc("join_group", { p_code: g2.invite_code });
    if (jErr) throw jErr;

    const round = await ensureRound(admin, g2, todayInTz(g2.timezone));
    const game = getGame(round.game_id)!;
    const limits = gameLimits(game);
    process.stdout.write(`semillas: el juego del día del grupo de prueba es ${game.id}
`);

    // mismo número de intento, dos jugadores: misma semilla (salvo que el juego del día sea de semilla por jugador); y no es la de la ronda
    const c1 = await startAttempt(admin, userC, round.id);
    const d1 = await startAttempt(admin, userD, round.id);
    if (game.seedScope === "player") expect(c1.seed).not.toBe(d1.seed);
    else expect(c1.seed).toBe(d1.seed);
    expect(c1.seed).not.toBe(round.seed);
    expect(c1.seed).toBe(attemptSeed(round.seed, 1, seedPepper(), seedProfile(game, userC)));

    // una traza armada con la semilla de la ronda no pasa validate (en un juego cuyo tablero depende de la semilla)
    const startedC1 = Date.parse((await admin.from("attempts").select("started_at").eq("id", c1.attemptId).single()).data!.started_at);
    if (game.validate && game.id === "piba-del-ipa") {
      await expect(
        finishAttempt(admin, userC, c1.attemptId, validResult(game.id, round.seed, 5), { now: new Date(startedC1 + limits.minDurationMs + 500) }),
      ).rejects.toMatchObject({ code: "invalid_events" });
    }

    // otro intento propio: otra semilla
    const c2 = await startAttempt(admin, userC, round.id);
    expect(c2.attemptNumber).toBe(2);
    expect(c2.seed).not.toBe(c1.seed);
    expect(c2.seed).toBe(attemptSeed(round.seed, 2, seedPepper(), seedProfile(game, userC)));

    // con la semilla del intento, el resultado se guarda
    const startedC2 = Date.parse((await admin.from("attempts").select("started_at").eq("id", c2.attemptId).single()).data!.started_at);
    const r5 = validResult(game.id, c2.seed, 5);
    const ok = await finishAttempt(admin, userC, c2.attemptId, r5, { now: new Date(startedC2 + Math.max(limits.minDurationMs + 500, r5.elapsedMs ?? 0)) });
    expect(ok.score).toBeGreaterThan(0);

    // la semilla del intento no está guardada en ningún lado: sin iniciarlo no hay de dónde leerla
    const { data: r } = await admin.from("rounds").select("*").eq("id", round.id).single();
    const { data: a } = await admin.from("attempts").select("*").eq("id", c2.attemptId).single();
    expect(JSON.stringify(r)).not.toContain(c2.seed);
    expect(JSON.stringify(a)).not.toContain(c2.seed);
  });

  it("semilla por jugador (seedScope 'player'): dos jugadores del mismo grupo reciben semillas distintas, cada intento propio otra, validate usa la del jugador; con 'group' siguen recibiendo la misma", async () => {
    const k = await keys();
    const c = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const d = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const userC = (await c.auth.signInAnonymously()).data.user!.id;
    const userD = (await d.auth.signInAnonymously()).data.user!.id;
    const { data: g3, error } = await c.rpc("create_group", { p_name: "test semilla por jugador" });
    if (error) throw error;
    const { error: jErr } = await d.rpc("join_group", { p_code: g3.invite_code });
    if (jErr) throw jErr;
    const round0 = await ensureRound(admin, g3, todayInTz(g3.timezone));
    const setGame = async (gameId: string) => {
      const seed = roundSeed(g3.id, round0.play_date, gameId);
      const { error: uErr } = await admin.from("rounds").update({ game_id: gameId, seed }).eq("id", round0.id);
      if (uErr) throw uErr;
      return { ...round0, game_id: gameId, seed };
    };

    // 'player': el juego de los caños (el de los autos, "saca-el-sunny", usa la misma extensión)
    expect(getGame("saca-el-sunny")!.seedScope).toBe("player");
    const round = await setGame("dale-un-trago-al-pibe");
    const game = getGame(round.game_id)!;
    expect(game.seedScope).toBe("player");
    const limits = gameLimits(game);
    const c1 = await startAttempt(admin, userC, round.id);
    const d1 = await startAttempt(admin, userD, round.id);
    expect(c1.seed).not.toBe(d1.seed);
    expect(c1.seed).toBe(attemptSeed(round.seed, 1, seedPepper(), userC));
    expect(d1.seed).toBe(attemptSeed(round.seed, 1, seedPepper(), userD));
    expect(c1.seed).not.toBe(attemptSeed(round.seed, 1, seedPepper()));
    // una traza armada con la semilla del otro jugador, o con la del grupo, no pasa validate
    const startedC1 = Date.parse((await admin.from("attempts").select("started_at").eq("id", c1.attemptId).single()).data!.started_at);
    const other = validResult(game.id, d1.seed, 5);
    await expect(finishAttempt(admin, userC, c1.attemptId, other, { now: new Date(startedC1 + Math.max(limits.minDurationMs + 500, other.elapsedMs ?? 0)) })).rejects.toMatchObject({ code: "invalid_events" });
    const c2 = await startAttempt(admin, userC, round.id);
    expect(c2.seed).not.toBe(c1.seed);
    expect(c2.seed).toBe(attemptSeed(round.seed, 2, seedPepper(), userC));
    const startedC2 = Date.parse((await admin.from("attempts").select("started_at").eq("id", c2.attemptId).single()).data!.started_at);
    const grp = validResult(game.id, attemptSeed(round.seed, 2, seedPepper()), 5);
    await expect(finishAttempt(admin, userC, c2.attemptId, grp, { now: new Date(startedC2 + Math.max(limits.minDurationMs + 500, grp.elapsedMs ?? 0)) })).rejects.toMatchObject({ code: "invalid_events" });
    // con la semilla propia, se guarda
    const c3 = await startAttempt(admin, userC, round.id);
    const startedC3 = Date.parse((await admin.from("attempts").select("started_at").eq("id", c3.attemptId).single()).data!.started_at);
    const mine = validResult(game.id, c3.seed, 5);
    const ok = await finishAttempt(admin, userC, c3.attemptId, mine, { now: new Date(startedC3 + Math.max(limits.minDurationMs + 500, mine.elapsedMs ?? 0)) });
    expect(ok.score).toBeGreaterThan(0);

    // 'group' (el default): la misma semilla para los dos, la de siempre
    const roundG = await setGame("piba-del-ipa");
    expect(getGame("piba-del-ipa")!.seedScope).toBeUndefined();
    const d2 = await startAttempt(admin, userD, roundG.id);
    expect(d2.attemptNumber).toBe(2);
    expect(d2.seed).toBe(attemptSeed(roundG.seed, 2, seedPepper()));
    const { data: fresh } = await admin.from("profiles").select("id").eq("id", userD).single();
    expect(fresh).not.toBeNull();
  });

  it("sin SEED_PEPPER en producción, start falla claro y no consume el intento", async () => {
    const k = await keys();
    const e = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    const userE = (await e.auth.signInAnonymously()).data.user!.id;
    const { data: g3, error } = await e.rpc("create_group", { p_name: "test pepper" });
    if (error) throw error;
    const round = await ensureRound(admin, g3, todayInTz(g3.timezone));

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_PEPPER", "");
    try {
      await expect(startAttempt(admin, userE, round.id)).rejects.toMatchObject({ code: "seed_pepper_missing", status: 500 });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await attemptsUsed(admin, round.id, userE)).toBe(0);

    // con pepper, la misma llamada anda
    const ok = await startAttempt(admin, userE, round.id);
    expect(ok.seed).toBe(attemptSeed(round.seed, 1, seedPepper(), seedProfile(getGame(round.game_id)!, userE)));
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
let torreR: Rapier | null = null;
/** un resultado válido para el juego; `elapsedMs`, si viene, es lo que tiene que durar el intento de prueba (cuando la partida puede ser más larga que minDurationMs + 500 ms) */
function validResult(gameId: string, seed: string, n: number): { score: number; events: unknown[]; elapsedMs?: number } {
  if (gameId === "piba-del-ipa") return { score: n, events: legitTrace(seed, n) };
  if (gameId === "quedo-re-tarado") {
    const events = humanTrace(200);
    return { score: scoreFor(events), events };
  }
  if (gameId === "los-deseos-de-larry") {
    // los tests terminan el intento a minDurationMs + 500 ms (5,5 s): una
    // partida cortada a los 5 s es coherente con esa duración
    const { events, result } = greedyTrace(seed, 300);
    return { score: result.score, events };
  }
  if (gameId === "hdp") {
    // el jugador modelo, cortado a los 58 s: el intento de prueba dura minDurationMs + 500 ms (58,5 s), y una partida de 60 s sería más larga que el intento
    const swipes = hdpTrace(seed, { reactionTicks: 36, jitterTicks: 24, errorPerMille: 200, swipeGapTicks: 36 }).events.filter((e): e is { tick: number; slot: 0 | 1 | 2 | 3; dir: "up" | "down" | "left" | "right" } => !("fin" in e) && e.tick < 3480);
    return { score: hdpSimulate(seed, swipes, 3480).score, events: [...swipes, { tick: 3480, fin: true }] };
  }
  if (gameId === "la-bolsita-del-jota") {
    // acierta la primera ronda apenas termina la mezcla (unos 3 s) y erra la segunda en cuanto puede: el intento de prueba dura minDurationMs + 500 ms (3,5 s)
    const { events, run } = bolsitaTrace(seed, { react: [0, 0], failRounds: [2], stopAtRound: 2 });
    return { score: run.score, events };
  }
  if (gameId === "barakatututu") {
    // hace la cuenta, pasa una ronda y erra la segunda (unos 10 s): el intento de prueba dura lo que la partida más 500 ms
    const { events, run } = barakaTrace(seed, { ...barakaModel, failAt: 1 });
    return { score: run.score, events, elapsedMs: run.endT + 500 };
  }
  if (gameId === "saca-el-sunny") {
    // saca un sunny y espera a que cierre: la partida dura siempre 120 s, así que el intento de prueba también
    const { events, run } = sacaTrace(seed, { ...sacaModel, solveOnly: 1 });
    return { score: run.score, events, elapsedMs: 120_000 + 500 };
  }
  if (gameId === "dale-un-trago-al-pibe") {
    // resuelve un puzzle y deja derramar el segundo: el intento de prueba dura lo que la partida más 500 ms
    const { events, run } = tragoTrace(seed, { ...tragoModel, spillAfter: 1 });
    return { score: run.score, events, elapsedMs: run.endT + 500 };
  }
  if (gameId === "cazando-colillas") {
    // come dos colillas y agarra el primer vapeador que pasa: según la semilla, eso puede tardar de 1 a 35 s, así que el intento de prueba dura lo que la partida más 500 ms
    const { events, result } = ranaTrace(seed, { reaction: 15, thenVapo: 2 });
    const endTick = events[events.length - 1]!.tick;
    return { score: result.score, events, elapsedMs: Math.floor((endTick * 1000) / 60) + 500 };
  }
  if (gameId === "cruza-con-el-chino") {
    // cruza el primer bloque y se queda en la calle siguiente hasta que lo atropellan (unos segundos)
    const { events, result } = cruzaTrace(seed, { blocks: 1 });
    return { score: result.rows, events };
  }
  if (gameId === "nach-salta") {
    // el jugador justo corre 3 s y el cierre queda ahí: el intento de prueba dura minDurationMs + 500 ms
    const { events, state } = nachSaltaTrace(seed, { reaction: 15, untilTick: 180 });
    return { score: Math.floor(state.dist / 1000), events };
  }
  if (gameId === "big-bro-afila") {
    // el jugador justo tira hasta 1 s y el cierre queda ahí: el intento de prueba dura minDurationMs + 500 ms
    const { events, state } = afilaTrace(seed, { untilTick: 60 });
    return { score: state.score, events };
  }
  if (gameId === "larry-en-la-hdp") {
    // un jugador sin errores hasta los 10 s (arma el primer pedido, así suma): el intento de prueba dura minDurationMs + 500 ms
    const { events, run } = larryHdpTrace(seed, { firstTap: [500, 500], tapGap: [300, 300], until: 10_000 });
    return { score: run.score, events };
  }
  if (gameId === "clase-con-el-bro") {
    // tres cortes del resolvedor con las pausas: la partida dura unos 6 s
    const { events, state } = claseTrace(seed, { gapMs: 300 });
    return { score: state.total, events };
  }
  if (gameId === "fumate-algo-chino") {
    // el jugador automático tira los tres al toque (unos 7 s, según la semilla: con algunas más que minDurationMs + 500 ms, así que el intento de prueba dura lo que la partida más 500 ms)
    const { events, result } = chinoTrace(seed, { aimTicks: 20 });
    const endTick = (events[events.length - 1] as { tick: number }).tick;
    return { score: result.best, events, elapsedMs: Math.floor((endTick * 1000) / 60) + 500 };
  }
  if (gameId === "servila-justa") {
    // el jugador perfecto sirve dos vasos y el cronómetro corta a los 10 s (tick 600): el intento de prueba dura minDurationMs + 500 ms
    const taps = servilaTrace(seed, { maxGlasses: 2 }).events.filter((e) => !("fin" in e)) as { tick: number; action: "down" | "up" }[];
    return { score: servilaSimulate(seed, taps, 600).score, events: [...taps, { tick: 600, fin: true }] };
  }
  if (gameId === "la-mayo") {
    // emboca dos y el cronómetro corta a los 2,5 s (tick 150)
    const { events, result } = mayoTrace(seed, { maxTaps: 2 });
    const taps = events.filter((e) => !("fin" in e));
    return { score: result.score, events: [...taps, { tick: 150, fin: true }] };
  }
  if (gameId === "apila-las-boludeces") {
    // suelta el primer objeto apenas el vaivén lo pone sobre la tabla y el cronómetro corta a los 2,5 s (tick 150)
    const plan = torrePlan(seed);
    let t = 1;
    while (Math.abs(torreSwayX(plan, 0, t)) > 18) t++;
    const inputs = [{ tick: t, action: "drop" as const }];
    const r = torreSimulate(torreR!, seed, inputs, 150);
    return { score: r.score, events: [...inputs, { tick: 150, fin: true }] };
  }
  if (gameId === "colgado-del-121") {
    // el jugador automático aguanta 1,5 s y el cronómetro corta ahí (el intento de prueba dura minDurationMs + 500 ms = 2,5 s)
    const { events, result } = colgadoTrace(seed, 90);
    return { score: result.score, events };
  }
  if (gameId === "busca-los-paris") {
    // un jugador honesto juega 4,5 s y el cronómetro corta ahí
    const { events, score } = parisTrace(seed, { untilMs: 4_500, rand: mulberry32(5) });
    return { score, events };
  }
  if (gameId === "pisteando-el-sunny") {
    // el conductor automático maneja 2,5 s y el cronómetro corta ahí (el intento de prueba dura minDurationMs + 500 ms = 3,5 s)
    const { events, result } = sunnyTrace(seed, 150);
    return { score: result.score, events };
  }
  if (gameId === "rastitas-rastotas") {
    // el bot juega 5 s y el cronómetro corta ahí
    const { events, result } = rastasTrace(seed, 300);
    return { score: result.score, events };
  }
  if (gameId === "caminando-por-18") {
    // el jugador perfecto camina 5 s y el cronómetro corta ahí
    const { events, result } = caminandoTrace(seed, 300);
    return { score: result.score, events };
  }
  if (gameId === "pegandole-al-jota") {
    // una ronda acertada: la pista de 3 s y la respuesta un segundo después (el intento dura 5,5 s)
    const events = jotaTrace(jotaRounds(seed), 1, { answerMs: () => 1_000 });
    return { score: 1, events };
  }
  if (gameId === "la-parrilla-del-bro") {
    // toques seguros durante 4 s y el cronómetro corta ahí (el intento dura 5,5 s)
    const events = parrillaTrace(canarioTimeline(seed), mulberry32(3), { until: 4_000 });
    return { score: events.length, events };
  }
  if (gameId === "remar-vuelve-a-casa") {
    // lo mismo: el bot del camino seguro rema 5 s y el cronómetro corta ahí
    const { events, result } = soberTrace(seed, 300);
    return { score: result.score, events };
  }
  throw new Error(`sin resultado válido para ${gameId}`);
}

export { AttemptError };
