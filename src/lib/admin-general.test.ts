import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminAction, Database, GroupRow } from "@/lib/supabase/types";
import { GAME_IDS } from "@/games";
import { AdminActionError, deckGameFor } from "./admin-actions";
import {
  changeOwner,
  cleanupTest,
  deleteGroup,
  deleteOrphans,
  deleteUser,
  describeCleanup,
  describeDeleteGroup,
  describeDeleteUser,
  describeOrphans,
  describeRemoveMember,
  describeResetSeason,
  listGameSettings,
  loadGroupDetail,
  loadGroupsAdmin,
  loadLog,
  loadUsersAdmin,
  removeMember,
  resetSeason,
  setGroupTest,
  toggleGame,
} from "./admin-general";
import { filterGroups, filterUsers, type UserAdminRow } from "./admin-filters";
import { enabledGameIds } from "./game-settings";
import { ensureRound, ensureSeason, seasonStandings } from "./rounds";
import { startAttempt } from "./attempts";
import { addDays, todayInTz } from "./time";

// se captura a quién va cada push, sin mandar nada
const pushCalls = vi.hoisted(() => ({ calls: [] as Array<{ ids: string[]; title: string; body: string }> }));
vi.mock("./push", () => ({
  pushConfigured: () => true,
  sendPushToProfiles: async (_admin: unknown, ids: readonly string[], payload: { title: string; body: string }) => {
    pushCalls.calls.push({ ids: [...ids], title: payload.title, body: payload.body });
    return { sent: ids.length, failed: 0, removed: 0 };
  },
}));

// La administración general del panel contra la base local (Supabase real
// en Docker). Corre solo si hay un stack en SUPABASE_TEST_URL.

const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const ADMIN_EMAIL = "admin-general@frog.test";

async function stackUp(): Promise<boolean> {
  try {
    return (await fetch(`${URL}/auth/v1/health`)).ok;
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

describe("vistas previas y filtros (puros)", () => {
  it("las vistas previas dicen qué se borra, con cantidades, y avisan si el grupo no es de prueba", () => {
    const g = describeDeleteGroup({ group: { id: "g", name: "los pibes", is_test: false }, members: 4, seasons: 2, rounds: 31, attempts: 97, orphans: [{ id: "a", name: "Ana" }], delete_orphans: true, deleted_users: 0 });
    expect(g.lines[0]).toBe('se borra el grupo "los pibes" con 4 integrantes, 2 temporadas, 31 rondas y 97 intentos.');
    expect(g.lines[1]).toContain("Ana");
    expect(g.warning).toContain("no está marcado como de prueba");
    expect(describeDeleteGroup({ group: { id: "g", name: "p", is_test: true }, members: 1, seasons: 1, rounds: 1, attempts: 1, orphans: [], delete_orphans: false, deleted_users: 0 })).toMatchObject({ lines: ['se borra el grupo "p" con 1 integrante, 1 temporada, 1 ronda y 1 intento.'], warning: null, blocked: null });
    const u = describeDeleteUser({ user: { id: "u", name: "Beto", email: null }, groups: [{ id: "g", name: "los pibes", role: "owner", is_test: false }], owner_of: [{ id: "g", name: "los pibes" }], memberships: 1, attempts: 5, push: 2 });
    expect(u.blocked?.text).toContain("es dueño de los pibes");
    expect(u.blocked?.links).toEqual([{ href: "/admin/grupos/g", label: "los pibes" }]);
    expect(u.warning).toContain("los pibes");
    expect(describeCleanup({ groups: [], users: [], members: 0, seasons: 0, rounds: 0, attempts: 0, deleted_groups: 0, deleted_users: 0 }).blocked).not.toBeNull();
    expect(describeCleanup({ groups: [{ id: "g", name: "t", members: 2 }], users: [{ id: "u", name: "U" }], members: 2, seasons: 1, rounds: 3, attempts: 9, deleted_groups: 0, deleted_users: 0 }).lines[2]).toContain("al admin nunca");
    expect(describeOrphans({ users: [], attempts: 0, push: 0, deleted_users: 0 }).blocked).not.toBeNull();
    expect(describeRemoveMember({ group: { id: "g", name: "t", is_test: true }, member: { id: "m", name: "Flor", role: "owner" }, season_number: 1, attempts: 3 }).blocked?.text).toContain("dueño");
    expect(describeResetSeason({ group: { id: "g", name: "t", is_test: true }, season_number: 2, starts_on_before: "2026-10-01", starts_on: "2026-10-12", ends_on: "2026-11-10", rounds: 12, attempts: 40 }).lines[0]).toContain("12 rondas y 40 intentos de la temporada 2");
  });

  it("los filtros de usuarios y la búsqueda de grupos", () => {
    const base = { avatar: {} as UserAdminRow["avatar"], createdAt: "", lastPlayed: null, push: 0, isAdmin: false };
    const users: UserAdminRow[] = [
      { ...base, id: "1", name: "Ana", email: "ana@x.y", groups: [{ id: "g", name: "g", role: "owner", isTest: false }] },
      { ...base, id: "2", name: "Beto", email: null, groups: [] },
      { ...base, id: "3", name: "Caro", email: null, groups: [{ id: "g", name: "g", role: "member", isTest: false }] },
    ];
    expect(filterUsers(users, "sin-grupo", "").map((u) => u.id)).toEqual(["2"]);
    expect(filterUsers(users, "anonimos", "").map((u) => u.id)).toEqual(["2", "3"]);
    expect(filterUsers(users, "con-email", "").map((u) => u.id)).toEqual(["1"]);
    expect(filterUsers(users, "todos", "ANA@").map((u) => u.id)).toEqual(["1"]);
    expect(filterUsers(users, "todos", "car").map((u) => u.id)).toEqual(["3"]);
    const groups = [
      { name: "los pibes", inviteCode: "ABC234" },
      { name: "las pibas", inviteCode: "XYZ789" },
    ];
    expect(filterGroups(groups, "xyz").map((g) => g.name)).toEqual(["las pibas"]);
    expect(filterGroups(groups, "pib").length).toBe(2);
  });
});

describe.skipIf(!up)("administración general contra la base local", () => {
  let admin: SupabaseClient<Database>;
  let anonKey: string;
  let adminUserId: string;
  const who = { adminEmail: ADMIN_EMAIL };

  async function anonUser(name: string) {
    const c = createClient<Database>(URL, anonKey, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInAnonymously({ options: { data: { display_name: name } } });
    if (error) throw error;
    return { client: c, id: data.user!.id };
  }
  async function newGroup(owner: { client: SupabaseClient<Database> }, name: string): Promise<GroupRow> {
    const { data, error } = await owner.client.rpc("create_group", { p_name: name });
    if (error) throw error;
    return data;
  }
  async function join(member: { client: SupabaseClient<Database> }, group: GroupRow) {
    const { error } = await member.client.rpc("join_group", { p_code: group.invite_code });
    if (error) throw error;
  }
  async function completed(round: { id: string }, profileId: string, score: number) {
    const s = await startAttempt(admin, profileId, round.id);
    await admin.from("attempts").update({ status: "completed", score, finished_at: new Date().toISOString() }).eq("id", s.attemptId);
    return s.attemptId;
  }
  const userExists = async (id: string) => ((await admin.from("profiles").select("id").eq("id", id)).data?.length ?? 0) > 0;
  const groupExists = async (id: string) => ((await admin.from("groups").select("id").eq("id", id)).data?.length ?? 0) > 0;
  const lastLog = async (action: AdminAction) => (await admin.from("admin_actions").select("*").eq("action", action).order("created_at", { ascending: false }).limit(1)).data?.[0];

  beforeAll(async () => {
    const k = await keys();
    anonKey = k.anon;
    admin = createClient<Database>(URL, k.service, { auth: { persistSession: false } });
    process.env.ADMIN_EMAILS = ADMIN_EMAIL;
    // el admin: un usuario con email confirmado (si ya existe de otra corrida, se entra con la contraseña para saber su id)
    const password = "frog-admin-general-2026";
    const { data, error } = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, password, email_confirm: true, user_metadata: { display_name: "la admin" } });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
    if (data?.user) adminUserId = data.user.id;
    else {
      const c = createClient<Database>(URL, anonKey, { auth: { persistSession: false } });
      const { data: s, error: e } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
      if (e || !s.user) throw new Error(`entrar como admin: ${e?.message ?? "sin sesión"}`);
      adminUserId = s.user.id;
    }
    // el grupo del seed está marcado como de prueba: se desmarca mientras corren estos tests para no limpiarlo
    await admin.from("groups").update({ is_test: false }).eq("invite_code", "JUEGA7");
  });

  afterAll(async () => {
    await admin.from("groups").update({ is_test: true }).eq("invite_code", "JUEGA7");
    await admin.from("game_settings").delete().neq("game_id", "");
  });

  it("borrar un grupo: la vista previa cuenta sin tocar nada; borrar se lleva todo lo suyo y nada de otros grupos, borra a los que quedan sin grupo (nunca al admin) y deja registro con los conteos", async () => {
    const a = await anonUser("Ana");
    const b = await anonUser("Beto");
    const c = await anonUser("Caro");
    const g = await newGroup(a, "borrar grupo");
    await join(b, g);
    await join(c, g);
    const other = await newGroup(c, "el otro grupo");
    await admin.from("group_members").insert({ group_id: g.id, profile_id: adminUserId, role: "member" } as never);
    const today = todayInTz(g.timezone);
    const round = await ensureRound(admin, g, today);
    await completed(round, a.id, 10);
    await completed(round, b.id, 20);
    const otherRound = await ensureRound(admin, other, today);
    await completed(otherRound, c.id, 5);
    await admin.from("push_subscriptions").insert({ profile_id: b.id, endpoint: `https://push.test/${b.id}`, p256dh: "p".repeat(80), auth: "a".repeat(20) });

    const preview = await deleteGroup(admin, { ...who, groupId: g.id, deleteOrphans: true, dryRun: true });
    expect(preview).toMatchObject({ group: { id: g.id, name: "borrar grupo", is_test: false }, members: 4, seasons: 1, rounds: 1, attempts: 2, delete_orphans: true, deleted_users: 0 });
    // quedan sin grupo Ana y Beto; Caro tiene el otro grupo y la admin es la admin
    expect(preview.orphans.map((o) => o.name).sort()).toEqual(["Ana", "Beto"]);
    expect(await groupExists(g.id)).toBe(true);
    expect(describeDeleteGroup(preview).warning).toContain("no está marcado");

    const r = await deleteGroup(admin, { ...who, groupId: g.id, deleteOrphans: true, dryRun: false });
    expect(r.deleted_users).toBe(2);
    expect(await groupExists(g.id)).toBe(false);
    expect(await userExists(a.id)).toBe(false);
    expect(await userExists(b.id)).toBe(false);
    expect((await admin.auth.admin.getUserById(b.id)).data.user).toBeNull();
    expect((await admin.from("push_subscriptions").select("id").eq("profile_id", b.id)).data).toEqual([]);
    expect(await userExists(c.id)).toBe(true);
    expect(await userExists(adminUserId)).toBe(true);
    // el otro grupo sigue entero
    expect(await groupExists(other.id)).toBe(true);
    expect((await admin.from("attempts").select("id").eq("round_id", otherRound.id)).data?.length).toBe(1);
    const log = await lastLog("delete_group");
    expect(log).toMatchObject({ admin_email: ADMIN_EMAIL, group_id: null, target: "borrar grupo" });
    expect(log?.details).toMatchObject({ members: 4, seasons: 1, rounds: 1, attempts: 2, deleted_users: 2 });

    // sin la opción, los usuarios quedan
    const d = await anonUser("Dani");
    const g2 = await newGroup(d, "sin borrar usuarios");
    await deleteGroup(admin, { ...who, groupId: g2.id, deleteOrphans: false, dryRun: false });
    expect(await userExists(d.id)).toBe(true);
    await expect(deleteGroup(admin, { ...who, groupId: g2.id, deleteOrphans: false, dryRun: true })).rejects.toMatchObject({ status: 404, code: "group_not_found" });
  });

  it("borrar un usuario: no al admin ni a un dueño; un integrante se va con todo lo suyo, aunque haya creado un grupo que ahora tiene otro dueño", async () => {
    await expect(deleteUser(admin, { ...who, profileId: adminUserId, dryRun: true })).rejects.toMatchObject({ status: 403, code: "admin_protected" });
    await expect(deleteUser(admin, { ...who, profileId: adminUserId, dryRun: false })).rejects.toMatchObject({ code: "admin_protected" });
    const a = await anonUser("Eli");
    const b = await anonUser("Fede");
    const g = await newGroup(a, "borrar usuario");
    await join(b, g);
    const preview = await deleteUser(admin, { ...who, profileId: a.id, dryRun: true });
    expect(preview.owner_of).toEqual([{ id: g.id, name: "borrar usuario" }]);
    expect(describeDeleteUser(preview).blocked?.links[0]?.href).toBe(`/admin/grupos/${g.id}`);
    await expect(deleteUser(admin, { ...who, profileId: a.id, dryRun: false })).rejects.toMatchObject({ status: 409, code: "is_owner" });
    expect(await userExists(a.id)).toBe(true);
    // le pasa la propiedad a Fede: ahora Eli es integrante y creó el grupo
    await changeOwner(admin, { ...who, groupId: g.id, profileId: b.id });
    const round = await ensureRound(admin, g, todayInTz(g.timezone));
    await completed(round, a.id, 7);
    await admin.from("push_subscriptions").insert({ profile_id: a.id, endpoint: `https://push.test/${a.id}`, p256dh: "p".repeat(80), auth: "a".repeat(20) });
    const r = await deleteUser(admin, { ...who, profileId: a.id, dryRun: false });
    expect(r).toMatchObject({ user: { id: a.id, name: "Eli", email: null }, memberships: 1, attempts: 1, push: 1 });
    expect(await userExists(a.id)).toBe(false);
    expect((await admin.auth.admin.getUserById(a.id)).data.user).toBeNull();
    expect((await admin.from("attempts").select("id").eq("profile_id", a.id)).data).toEqual([]);
    expect((await admin.from("group_members").select("profile_id").eq("group_id", g.id)).data).toEqual([{ profile_id: b.id }]);
    const { data: group } = await admin.from("groups").select("created_by").eq("id", g.id).single();
    expect(group?.created_by).toBe(b.id);
    expect(await lastLog("delete_user")).toMatchObject({ target: "Eli", details: expect.objectContaining({ attempts: 1, push: 1 }) });
  });

  it("limpiar datos de prueba: borra solo los grupos marcados y a los usuarios que quedan sin grupo; un grupo sin marcar con usuarios compartidos queda intacto, y sus usuarios también", async () => {
    const a = await anonUser("Gabi");
    const b = await anonUser("Hugo");
    const c = await anonUser("Ivo");
    const test1 = await newGroup(a, "prueba uno");
    await join(b, test1);
    await join(c, test1);
    const test2 = await newGroup(b, "prueba dos");
    const real = await newGroup(c, "grupo real");
    await join(b, real);
    await admin.from("group_members").insert({ group_id: test1.id, profile_id: adminUserId, role: "member" } as never);
    await setGroupTest(admin, test1.id, true);
    await setGroupTest(admin, test2.id, true);
    const round = await ensureRound(admin, test1, todayInTz(test1.timezone));
    await completed(round, a.id, 1);

    const preview = await cleanupTest(admin, { ...who, dryRun: true });
    expect(preview.groups.map((g) => g.name).sort()).toEqual(["prueba dos", "prueba uno"]);
    // Gabi solo está en grupos de prueba; Hugo e Ivo están en el grupo real; la admin es la admin
    expect(preview.users.map((u) => u.name)).toEqual(["Gabi"]);
    expect(preview).toMatchObject({ members: 5, seasons: 1, rounds: 1, attempts: 1, deleted_groups: 0, deleted_users: 0 });
    expect(await groupExists(test1.id)).toBe(true);

    const r = await cleanupTest(admin, { ...who, dryRun: false });
    expect(r).toMatchObject({ deleted_groups: 2, deleted_users: 1 });
    expect(await groupExists(test1.id)).toBe(false);
    expect(await groupExists(test2.id)).toBe(false);
    expect(await groupExists(real.id)).toBe(true);
    expect(await userExists(a.id)).toBe(false);
    expect(await userExists(b.id)).toBe(true);
    expect(await userExists(c.id)).toBe(true);
    expect(await userExists(adminUserId)).toBe(true);
    expect((await admin.from("group_members").select("profile_id").eq("group_id", real.id)).data?.length).toBe(2);
    expect(await lastLog("cleanup_test")).toMatchObject({ details: expect.objectContaining({ deleted_groups: 2, deleted_users: 1 }) });
    // la lista de grupos del panel ya no los tiene y marca el real como no prueba
    const list = await loadGroupsAdmin(admin);
    expect(list.find((g) => g.id === real.id)).toMatchObject({ isTest: false, members: 2 });
    expect(list.some((g) => g.id === test1.id)).toBe(false);
  });

  it("usuarios sin grupo: la pestaña los lista y se borran todos juntos, nunca el admin", async () => {
    const a = await anonUser("Juli");
    const g = await newGroup(a, "efímero");
    const b = await anonUser("Kiko");
    await join(b, g);
    await deleteGroup(admin, { ...who, groupId: g.id, deleteOrphans: false, dryRun: false });
    const users = await loadUsersAdmin(admin);
    const orphans = filterUsers(users, "sin-grupo", "");
    expect(orphans.map((u) => u.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const me = users.find((u) => u.id === adminUserId)!;
    expect(me).toMatchObject({ email: ADMIN_EMAIL, isAdmin: true, groups: [] });
    const preview = await deleteOrphans(admin, { ...who, dryRun: true });
    expect(preview.users.map((u) => u.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(preview.users.some((u) => u.id === adminUserId)).toBe(false);
    const r = await deleteOrphans(admin, { ...who, dryRun: false });
    expect(r.deleted_users).toBeGreaterThanOrEqual(2);
    expect(await userExists(a.id)).toBe(false);
    expect(await userExists(b.id)).toBe(false);
    expect(await userExists(adminUserId)).toBe(true);
    expect(await lastLog("delete_orphans")).toMatchObject({ details: expect.objectContaining({ deleted_users: r.deleted_users }) });
  });

  it("grupos: sacar a alguien borra sus intentos de la temporada actual y recalcula la tabla; las temporadas cerradas no cambian; cambiar el dueño intercambia los roles; reiniciar borra las rondas de la actual y conserva las cerradas", async () => {
    const a = await anonUser("Lola");
    const b = await anonUser("Mati");
    const g = await newGroup(a, "grupos admin");
    await join(b, g);
    const today = todayInTz(g.timezone);
    // una temporada 1 cerrada, con una ronda y un intento de Mati, campeón Mati
    const { data: closed } = await admin.from("seasons").insert({ group_id: g.id, number: 1, starts_on: addDays(today, -40), ends_on: addDays(today, -11), closed_at: new Date().toISOString(), winner_profile_id: b.id }).select().single();
    const { data: oldRound } = await admin.from("rounds").insert({ group_id: g.id, season_id: closed!.id, play_date: addDays(today, -20), game_id: "la-mayo", seed: "vieja" }).select().single();
    const ago = new Date(Date.now() - 60_000).toISOString();
    const ins1 = await admin.from("attempts").insert({ round_id: oldRound!.id, profile_id: b.id, attempt_number: 1, status: "completed", score: 9, started_at: ago, finished_at: new Date().toISOString() });
    expect(ins1.error).toBeNull();
    // la temporada 2, la actual, con la ronda de hoy y la de ayer
    const season = await ensureSeason(admin, g, today);
    expect(season.number).toBe(2);
    const round = await ensureRound(admin, g, today);
    const { data: yesterday } = await admin.from("rounds").insert({ group_id: g.id, season_id: season.id, play_date: addDays(today, -1), game_id: "la-mayo", seed: "ayer" }).select().single();
    const ins2 = await admin.from("attempts").insert({ round_id: yesterday!.id, profile_id: b.id, attempt_number: 1, status: "completed", score: 50, started_at: ago, finished_at: new Date().toISOString() });
    expect(ins2.error).toBeNull();
    await completed(round, a.id, 10);
    await completed(round, b.id, 20);
    const before = await seasonStandings(admin, season);
    expect(before.map((s) => s.profileId)).toEqual([b.id, a.id]);

    const detail = (await loadGroupDetail(admin, g.id))!;
    expect(detail.members.map((m) => [m.name, m.role, m.played])).toEqual([
      ["Lola", "owner", 1],
      ["Mati", "member", 2],
    ]);
    expect(detail.currentSeason).toMatchObject({ number: 2, day: 1 });
    expect(detail.seasons.map((s) => [s.number, s.rounds, s.attempts])).toEqual([
      [2, 2, 3],
      [1, 1, 1],
    ]);

    // al dueño no se lo saca
    await expect(removeMember(admin, { ...who, groupId: g.id, profileId: a.id, dryRun: false })).rejects.toMatchObject({ status: 409, code: "is_owner" });
    // la vista previa de Mati: sus 2 intentos de la temporada 2
    const preview = await removeMember(admin, { ...who, groupId: g.id, profileId: b.id, dryRun: true });
    expect(preview).toMatchObject({ member: { id: b.id, name: "Mati", role: "member" }, season_number: 2, attempts: 2 });
    const r = await removeMember(admin, { ...who, groupId: g.id, profileId: b.id, dryRun: false });
    expect(r.attempts).toBe(2);
    const after = await seasonStandings(admin, season);
    expect(after.map((s) => s.profileId)).toEqual([a.id]);
    expect((await admin.from("group_members").select("profile_id").eq("group_id", g.id)).data).toEqual([{ profile_id: a.id }]);
    // la temporada cerrada no cambió: su intento y su campeón siguen
    expect((await admin.from("attempts").select("id").eq("round_id", oldRound!.id)).data?.length).toBe(1);
    expect((await admin.from("seasons").select("winner_profile_id, closed_at").eq("id", closed!.id).single()).data).toMatchObject({ winner_profile_id: b.id });
    expect(await userExists(b.id)).toBe(true);
    expect(await lastLog("remove_member")).toMatchObject({ group_id: g.id, target: "grupos admin", details: expect.objectContaining({ attempts: 2 }) });

    // cambiar el dueño: Mati vuelve a entrar y pasa a ser el dueño; Lola queda integrante
    await join(b, g);
    await expect(changeOwner(admin, { ...who, groupId: g.id, profileId: a.id })).rejects.toMatchObject({ code: "already_owner" });
    const co = await changeOwner(admin, { ...who, groupId: g.id, profileId: b.id });
    expect(co).toMatchObject({ from: { id: a.id, name: "Lola" }, to: { id: b.id, name: "Mati" } });
    const { data: roles } = await admin.from("group_members").select("profile_id, role").eq("group_id", g.id);
    expect(new Map(roles!.map((m) => [m.profile_id, m.role]))).toEqual(new Map([[a.id, "member"], [b.id, "owner"]]));
    expect(await lastLog("change_owner")).toMatchObject({ group_id: g.id });

    // reiniciar la temporada: se borran las rondas e intentos de la 2 y vuelve a empezar hoy con el mismo número
    const { data: fresh } = await admin.from("groups").select("*").eq("id", g.id).single();
    const rp = await resetSeason(admin, { ...who, group: fresh!, dryRun: true });
    expect(rp).toMatchObject({ season_number: 2, rounds: 2, attempts: 1, starts_on: today, ends_on: addDays(today, 29) });
    expect((await admin.from("rounds").select("id").eq("season_id", season.id)).data?.length).toBe(2);
    const rr = await resetSeason(admin, { ...who, group: fresh!, dryRun: false });
    expect(rr.rounds).toBe(2);
    expect((await admin.from("rounds").select("id").eq("season_id", season.id)).data).toEqual([]);
    const { data: s2 } = await admin.from("seasons").select("*").eq("id", season.id).single();
    expect(s2).toMatchObject({ number: 2, starts_on: today, ends_on: addDays(today, 29), closed_at: null });
    // la cerrada sigue con su ronda, su intento y su campeón
    expect((await admin.from("rounds").select("id").eq("season_id", closed!.id)).data?.length).toBe(1);
    expect((await admin.from("seasons").select("winner_profile_id").eq("id", closed!.id).single()).data?.winner_profile_id).toBe(b.id);
    expect(await lastLog("reset_season")).toMatchObject({ group_id: g.id, details: expect.objectContaining({ rounds: 2, attempts: 1 }) });
    // la ronda de hoy se vuelve a crear en la temporada reiniciada
    const again = await ensureRound(admin, g, today);
    expect(again.season_id).toBe(season.id);
  });

  it("juegos: un juego deshabilitado no sale en las rondas nuevas, la ronda de hoy no cambia, y no se puede deshabilitar el último", async () => {
    const a = await anonUser("Nina");
    const g = await newGroup(a, "rotación");
    const today = todayInTz(g.timezone);
    const season = await ensureSeason(admin, g, today);
    const wouldBe = deckGameFor(g, season, today);
    const other = await newGroup(a, "rotación hoy");
    const existing = await ensureRound(admin, other, today);
    try {
      // se apaga el que le tocaba al grupo nuevo y el de la ronda que ya existe
      const r = await toggleGame(admin, { ...who, gameId: wouldBe, enabled: false });
      expect(r).toMatchObject({ game_id: wouldBe, enabled: false, enabled_count: GAME_IDS.length - 1 });
      if (existing.game_id !== wouldBe) await toggleGame(admin, { ...who, gameId: existing.game_id, enabled: false });
      const enabled = await enabledGameIds(admin);
      expect(enabled).not.toContain(wouldBe);
      expect((await listGameSettings(admin)).find((x) => x.id === wouldBe)?.enabled).toBe(false);
      // la ronda nueva usa otro juego, el del mazo con los habilitados
      const round = await ensureRound(admin, g, today);
      expect(round.game_id).not.toBe(wouldBe);
      expect(round.game_id).toBe(deckGameFor(g, season, today, enabled));
      // y mañana tampoco sale, en varios grupos
      for (let i = 0; i < 4; i++) {
        const gi = await newGroup(a, `rotación ${i}`);
        for (let d = 0; d < 3; d++) {
          const ri = await ensureRound(admin, gi, addDays(today, d));
          expect(ri.game_id).not.toBe(wouldBe);
        }
      }
      // la ronda de hoy que ya existía no cambia
      const { data: same } = await admin.from("rounds").select("game_id, seed").eq("id", existing.id).single();
      expect(same).toEqual({ game_id: existing.game_id, seed: existing.seed });
      expect(await lastLog("toggle_game")).toMatchObject({ target: existing.game_id !== wouldBe ? existing.game_id : wouldBe, details: expect.objectContaining({ enabled: false }) });
      // no se puede apagar el último
      for (const id of GAME_IDS) if (id !== wouldBe && id !== existing.game_id && id !== "la-mayo") await toggleGame(admin, { ...who, gameId: id, enabled: false });
      if ("la-mayo" !== wouldBe && "la-mayo" !== existing.game_id) {
        await expect(toggleGame(admin, { ...who, gameId: "la-mayo", enabled: false })).rejects.toMatchObject({ status: 409, code: "last_game" });
        expect(await enabledGameIds(admin)).toEqual(["la-mayo"]);
      } else {
        const last = (await enabledGameIds(admin))[0]!;
        await expect(toggleGame(admin, { ...who, gameId: last, enabled: false })).rejects.toMatchObject({ code: "last_game" });
      }
      expect((await enabledGameIds(admin)).length).toBe(1);
      await expect(toggleGame(admin, { ...who, gameId: "no-existe", enabled: false })).rejects.toBeInstanceOf(AdminActionError);
    } finally {
      await admin.from("game_settings").delete().neq("game_id", "");
    }
    expect(await enabledGameIds(admin)).toEqual(GAME_IDS);
  });

  it("avisos: la prueba llega solo al admin, el anuncio solo a quien corresponde, y el límite de 10 minutos se respeta", async () => {
    const push = await import("./admin-push");
    expect(push.announceAllowedAt(null)).toBeNull();
    const now = new Date("2026-10-12T12:00:00Z");
    expect(push.announceAllowedAt(new Date("2026-10-12T11:55:00Z"), now)?.toISOString()).toBe("2026-10-12T12:05:00.000Z");
    expect(push.announceAllowedAt(new Date("2026-10-12T11:49:00Z"), now)).toBeNull();
    expect(() => push.parseAnnouncement("x".repeat(121))).toThrow(AdminActionError);
    expect(() => push.parseAnnouncement("   ")).toThrow(AdminActionError);
    expect(push.parseAnnouncement("  hola   che ")).toBe("hola che");

    const a = await anonUser("Oli");
    const b = await anonUser("Pato");
    const c = await anonUser("Quique");
    const g = await newGroup(a, "avisos");
    await join(b, g);
    const sub = (id: string, n = 0) => ({ profile_id: id, endpoint: `https://push.test/${id}/${n}/${Date.now()}`, p256dh: "p".repeat(80), auth: "a".repeat(20) });
    // la admin arranca sin suscripciones de otras corridas
    await admin.from("push_subscriptions").delete().eq("profile_id", adminUserId);
    const ins = await admin.from("push_subscriptions").insert([sub(a.id), sub(a.id, 1), sub(c.id), sub(adminUserId)]);
    expect(ins.error).toBeNull();
    // Pato no tiene avisos activados; Quique no está en el grupo

    pushCalls.calls.length = 0;
    const t = await push.sendTestPush(admin, { adminUserId, adminEmail: ADMIN_EMAIL });
    expect(t).toMatchObject({ sent: 1, subscriptions: 1 });
    expect(pushCalls.calls).toEqual([{ ids: [adminUserId], title: "frog", body: push.TEST_BODY }]);
    expect(await lastLog("push_test")).toMatchObject({ target: ADMIN_EMAIL });
    await expect(push.sendTestPush(admin, { adminUserId: b.id, adminEmail: ADMIN_EMAIL })).rejects.toMatchObject({ code: "no_subscription" });

    // se limpia cualquier anuncio anterior para arrancar el reloj de 10 minutos en cero
    await admin.from("admin_actions").delete().eq("action", "push_announce");
    pushCalls.calls.length = 0;
    const preview = await push.sendAnnouncement(admin, { text: "hoy a las 21 hay juego", groupId: g.id, adminEmail: ADMIN_EMAIL, dryRun: true });
    expect(preview).toMatchObject({ text: "hoy a las 21 hay juego", to: "avisos", recipients: 1, allowedAt: null, sent: 0 });
    expect(pushCalls.calls).toEqual([]);
    const r = await push.sendAnnouncement(admin, { text: "hoy a las 21 hay juego", groupId: g.id, adminEmail: ADMIN_EMAIL, dryRun: false });
    expect(r).toMatchObject({ recipients: 1, sent: 1 });
    expect(pushCalls.calls).toEqual([{ ids: [a.id], title: "frog", body: "hoy a las 21 hay juego" }]);
    expect(await lastLog("push_announce")).toMatchObject({ group_id: g.id, target: "avisos", details: expect.objectContaining({ text: "hoy a las 21 hay juego", recipients: 1, sent: 1 }) });
    // el segundo, enseguida: no
    await expect(push.sendAnnouncement(admin, { text: "otro", groupId: null, adminEmail: ADMIN_EMAIL, dryRun: false })).rejects.toMatchObject({ status: 429, code: "too_soon" });
    expect((await push.sendAnnouncement(admin, { text: "otro", groupId: null, adminEmail: ADMIN_EMAIL, dryRun: true })).allowedAt).not.toBeNull();
    expect(pushCalls.calls.length).toBe(1);
    // pasados los 10 minutos (el reloj se adelanta): a todos los que tienen avisos
    const later = new Date(Date.now() + 11 * 60 * 1000);
    const all = await push.sendAnnouncement(admin, { text: "para todos", groupId: null, adminEmail: ADMIN_EMAIL, dryRun: false, now: later });
    expect(all.recipients).toBeGreaterThanOrEqual(3);
    const ids = pushCalls.calls[1]!.ids;
    expect(ids).toEqual(expect.arrayContaining([a.id, c.id, adminUserId]));
    expect(ids).not.toContain(b.id);
    expect(new Set(ids).size).toBe(ids.length);
    await expect(push.sendAnnouncement(admin, { text: "x", groupId: "00000000-0000-4000-8000-00000000dead", adminEmail: ADMIN_EMAIL, dryRun: true })).rejects.toMatchObject({ code: "group_not_found" });
  });

  it("transacciones: si una acción falla a mitad de camino no queda nada a medias; game_settings y admin_actions no se leen ni se escriben desde un cliente", async () => {
    const a = await anonUser("Rita");
    const g = await newGroup(a, "a medias");
    // el registro exige el email del admin: con null, la función falla después de borrar y todo se deshace
    const { error } = await admin.rpc("admin_delete_group", { p_group_id: g.id, p_delete_orphans: true, p_admin_emails: [], p_admin_email: null as unknown as string, p_dry_run: false });
    expect(error).not.toBeNull();
    expect(await groupExists(g.id)).toBe(true);
    expect(await userExists(a.id)).toBe(true);
    const { error: e2 } = await admin.rpc("admin_remove_member", { p_group_id: g.id, p_profile_id: a.id, p_admin_email: null as unknown as string, p_dry_run: false });
    expect(e2).not.toBeNull();
    // desde el cliente, nada
    const { data: s1, error: c1 } = await a.client.from("game_settings").select("*");
    expect(c1).not.toBeNull();
    expect(s1).toBeNull();
    const { error: c2 } = await a.client.from("game_settings").insert({ game_id: "la-mayo", enabled: false } as never);
    expect(c2).not.toBeNull();
    const { error: c3 } = await a.client.from("admin_actions").select("*");
    expect(c3).not.toBeNull();
    const { error: c4 } = await a.client.rpc("admin_cleanup_test", { p_admin_emails: [], p_admin_email: "x", p_dry_run: true });
    expect(c4).not.toBeNull();
    const { error: c5 } = await a.client.from("groups").update({ is_test: true }).eq("id", g.id);
    expect(c5).not.toBeNull();
    // el registro se lee entero desde el panel
    const log = await loadLog(admin, 5);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]).toMatchObject({ adminEmail: ADMIN_EMAIL });
  });
});
