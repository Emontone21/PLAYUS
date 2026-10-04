import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, GroupRow } from "@/lib/supabase/types";
import { adminEmails, isAdminUser } from "./admin-identity";
import { DECK, deckGameFor, loadGroupsOverview, recentAdminActions, setTodayGame, validateForAdmin, AdminActionError } from "./admin-actions";
import { ensureRound, ensureSeason } from "./rounds";
import { finishAttempt, startAttempt, AttemptError } from "./attempts";
import { roundSeed } from "./deck";
import { todayInTz } from "./time";
import { botTrace as claseTrace } from "@/games/clase-con-el-bro/rules";
import { botTrace as chinoTrace } from "@/games/fumate-algo-chino/rules";

// El panel de admin contra la base local (Supabase real en Docker). Corre
// solo si hay un stack en SUPABASE_TEST_URL; si no responde, se saltea.

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const ADMIN = "admin@frog.test";

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

describe("quién es admin", () => {
  it("la lista sale de ADMIN_EMAILS (coma, espacios y mayúsculas no importan); es admin la sesión con ese email confirmado y no anónima", () => {
    expect(adminEmails(" Dueño@Frog.test, otro@frog.test ,, ")).toEqual(["dueño@frog.test", "otro@frog.test"]);
    expect(adminEmails(undefined)).toEqual([]);
    const emails = ["dueno@frog.test"];
    expect(isAdminUser({ email: "Dueno@frog.test", email_confirmed_at: "2026-10-01T00:00:00Z", is_anonymous: false }, emails)).toBe(true);
    // anónimo, sin email, sin confirmar o con otro email: no
    expect(isAdminUser({ email: "dueno@frog.test", email_confirmed_at: "2026-10-01T00:00:00Z", is_anonymous: true }, emails)).toBe(false);
    expect(isAdminUser({ email: null, is_anonymous: true }, emails)).toBe(false);
    expect(isAdminUser({ email: "dueno@frog.test", email_confirmed_at: null, is_anonymous: false }, emails)).toBe(false);
    expect(isAdminUser({ email: "otra@frog.test", email_confirmed_at: "2026-10-01T00:00:00Z", is_anonymous: false }, emails)).toBe(false);
    expect(isAdminUser(null, emails)).toBe(false);
    // con la lista vacía nadie es admin
    expect(isAdminUser({ email: "dueno@frog.test", email_confirmed_at: "2026-10-01T00:00:00Z", is_anonymous: false }, [])).toBe(false);
  });
});

describe.skipIf(!up)("panel de admin contra la base local", () => {
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
    const { data: g, error } = await a.rpc("create_group", { p_name: "test admin" });
    if (error) throw error;
    group = g;
    const { error: jErr } = await b.rpc("join_group", { p_code: group.invite_code });
    if (jErr) throw jErr;
  });

  it("sin intentos: cambia el juego y la semilla de la ronda de hoy, y deja registro", async () => {
    const today = todayInTz(group.timezone);
    const before = await ensureRound(admin, group, today);
    const target = before.game_id === "la-mayo" ? "servila-justa" : "la-mayo";
    const r = await setTodayGame(admin, { group, gameId: target, adminEmail: ADMIN });
    expect(r).toMatchObject({ roundId: before.id, playDate: today, fromGameId: before.game_id, toGameId: target, deletedAttempts: 0, action: "set_game" });
    const { data: after } = await admin.from("rounds").select("*").eq("id", before.id).single();
    expect(after?.game_id).toBe(target);
    expect(after?.seed).toBe(roundSeed(group.id, today, target));
    const actions = await recentAdminActions(admin, 5);
    expect(actions[0]).toMatchObject({ admin_email: ADMIN, action: "set_game", group_id: group.id, from_game_id: before.game_id, to_game_id: target, deleted_attempts: 0, groupName: "test admin" });
    const overview = (await loadGroupsOverview(admin)).find((g) => g.id === group.id)!;
    expect(overview).toMatchObject({ name: "test admin", members: 2, today, attempts: 0, people: 0 });
    expect(overview.round?.gameId).toBe(target);
  });

  it("con intentos en cualquier estado: los borra todos en la misma transacción, deja registro con la cantidad, y un /finish del intento borrado responde con su código", async () => {
    const today = todayInTz(group.timezone);
    const round = await ensureRound(admin, group, today);
    // A: uno completado y uno en curso; B: uno abandonado
    const s1 = await startAttempt(admin, userA, round.id);
    await admin.from("attempts").update({ status: "completed", score: 1, finished_at: new Date().toISOString() }).eq("id", s1.attemptId);
    const s2 = await startAttempt(admin, userA, round.id);
    const s3 = await startAttempt(admin, userB, round.id);
    await admin.from("attempts").update({ status: "abandoned" }).eq("id", s3.attemptId);
    const overview = (await loadGroupsOverview(admin)).find((g) => g.id === group.id)!;
    expect(overview).toMatchObject({ attempts: 3, people: 2 });

    const target = round.game_id === "la-mayo" ? "servila-justa" : "la-mayo";
    const r = await setTodayGame(admin, { group, gameId: target, adminEmail: ADMIN });
    expect(r.deletedAttempts).toBe(3);
    const { data: left } = await admin.from("attempts").select("id").eq("round_id", round.id);
    expect(left).toEqual([]);
    expect((await recentAdminActions(admin, 1))[0]).toMatchObject({ to_game_id: target, deleted_attempts: 3 });
    // quien estaba jugando: su intento ya no está
    await expect(finishAttempt(admin, userA, s2.attemptId, { score: 1, events: [] })).rejects.toMatchObject({ status: 410, code: "attempt_deleted" } satisfies Partial<AttemptError>);
    // y vuelve a tener los 3 intentos
    const again = await startAttempt(admin, userA, round.id);
    expect(again.attemptNumber).toBe(1);
    expect(again.attemptsLeft).toBe(group.max_attempts - 1);
  });

  it("si algo falla a mitad de camino, no queda nada a medias", async () => {
    const today = todayInTz(group.timezone);
    const round = await ensureRound(admin, group, today);
    const season = await ensureSeason(admin, group, today);
    const s = await startAttempt(admin, userB, round.id);
    const countActions = async () => (await admin.from("admin_actions").select("id").eq("group_id", group.id)).data?.length ?? 0;
    const actionsBefore = await countActions();
    // un id de juego que viola la restricción de rounds: la función falla después de borrar los intentos
    const { error } = await admin.rpc("admin_set_today_game", { p_group_id: group.id, p_season_id: season.id, p_play_date: today, p_game_id: "JUEGO INVÁLIDO", p_seed: "s", p_admin_email: ADMIN, p_action: "set_game" });
    expect(error).not.toBeNull();
    const { data: still } = await admin.from("attempts").select("id").eq("id", s.attemptId);
    expect(still?.length).toBe(1);
    expect(await countActions()).toBe(actionsBefore);
    const { data: same } = await admin.from("rounds").select("game_id").eq("id", round.id).single();
    expect(same?.game_id).toBe(round.game_id);
    // y un juego que no está en el registro ni llega a la base
    await expect(setTodayGame(admin, { group, gameId: "no-existe", adminEmail: ADMIN })).rejects.toBeInstanceOf(AdminActionError);
  });

  it("\"el que toca en el mazo\" vuelve a la carta del mazo de ese día", async () => {
    const today = todayInTz(group.timezone);
    const season = await ensureSeason(admin, group, today);
    const expected = deckGameFor(group, season, today);
    const r = await setTodayGame(admin, { group, gameId: DECK, adminEmail: ADMIN });
    expect(r.action).toBe("reset_to_deck");
    expect(r.toGameId).toBe(expected);
    const { data: round } = await admin.from("rounds").select("*").eq("id", r.roundId).single();
    expect(round?.game_id).toBe(expected);
    expect(round?.seed).toBe(roundSeed(group.id, today, expected));
  });

  it("un grupo en otra zona horaria usa su propio hoy, y si no tiene ronda se la crea dentro de su temporada", async () => {
    const k = await keys();
    const c = createClient<Database>(URL, k.anon, { auth: { persistSession: false } });
    await c.auth.signInAnonymously();
    // Kiritimati va 14 h adelante de UTC: a veces es otro día que en Montevideo
    const { data: far, error } = await c.rpc("create_group", { p_name: "test admin lejos", p_timezone: "Pacific/Kiritimati" });
    if (error) throw error;
    const today = todayInTz("Pacific/Kiritimati");
    const r = await setTodayGame(admin, { group: far, gameId: "la-mayo", adminEmail: ADMIN });
    expect(r.playDate).toBe(today);
    expect(r.fromGameId).toBeNull();
    const { data: round } = await admin.from("rounds").select("*").eq("id", r.roundId).single();
    expect(round?.play_date).toBe(today);
    expect(round?.game_id).toBe("la-mayo");
    const { data: season } = await admin.from("seasons").select("*").eq("id", round!.season_id).single();
    expect(season?.group_id).toBe(far.id);
    expect(season!.starts_on <= today && today <= season!.ends_on!).toBe(true);
    const overview = (await loadGroupsOverview(admin)).find((g) => g.id === far.id)!;
    expect(overview.today).toBe(today);
    expect(overview.timezone).toBe("Pacific/Kiritimati");
  });

  it("validar una partida de prueba corre el validate del juego y no escribe nada; un juego que no existe se rechaza", async () => {
    const count = async (table: "attempts" | "rounds") => (await admin.from(table).select("id")).data?.length ?? 0;
    const [a0, r0] = await Promise.all([count("attempts"), count("rounds")]);
    const seed = "prueba-admin";
    const clase = claseTrace(seed, { offsets: [100, 0, -100] });
    const ok = await validateForAdmin("clase-con-el-bro", seed, { score: clase.state.total, events: clase.events }, 12_000);
    expect(ok).toMatchObject({ valid: true, reason: null, score: clase.state.total, recomputed: clase.state.total, events: 3 });
    expect(ok.bytes).toBeGreaterThan(50);
    const inflated = await validateForAdmin("clase-con-el-bro", seed, { score: clase.state.total + 1, events: clase.events }, 12_000);
    expect(inflated.valid).toBe(false);
    expect(inflated.reason).toContain("validate");
    const chino = chinoTrace(seed);
    const short = await validateForAdmin("fumate-algo-chino", seed, { score: chino.result.best, events: chino.events }, 100);
    expect(short.valid).toBe(false);
    expect(short.reason).toContain("duración");
    expect(short.recomputed).toBe(chino.result.best);
    await expect(validateForAdmin("no-existe", seed, { score: 0, events: [] }, 5000)).rejects.toMatchObject({ status: 400, code: "unknown_game" });
    await expect(validateForAdmin("la-mayo", seed, "nada", 5000)).rejects.toMatchObject({ code: "bad_body" });
    const [a1, r1] = await Promise.all([count("attempts"), count("rounds")]);
    expect([a1, r1]).toEqual([a0, r0]);
  });
});
