import { NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin, type AdminIdentity } from "@/lib/admin";
import { AdminActionError } from "@/lib/admin-actions";
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
  removeMember,
  resetSeason,
  setGroupTest,
  toggleGame,
  type Preview,
} from "@/lib/admin-general";
import { sendAnnouncement, sendTestPush } from "@/lib/admin-push";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { jsonError, readFakeToday } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/admin/{acción}   → solo el admin (403 si no), siempre comprobado en
// el servidor antes de tocar nada. Las acciones destructivas aceptan
// { dryRun: true } y devuelven la vista previa (qué se va a borrar, con
// cantidades) sin cambiar nada; sin dryRun hacen la acción entera en una
// transacción y devuelven el resumen. Las de cambiar el juego de hoy y
// validar siguen en sus rutas propias (set-game, validate).
//
//   group-test     { groupId, isTest }
//   delete-group   { groupId, deleteOrphans?, dryRun? }
//   delete-user    { profileId, dryRun? }
//   cleanup-test   { dryRun? }
//   delete-orphans { dryRun? }
//   remove-member  { groupId, profileId, dryRun? }
//   change-owner   { groupId, profileId }
//   reset-season   { groupId, dryRun? }
//   toggle-game    { gameId, enabled }
//   push-test      {}
//   push-announce  { text, groupId?, dryRun? }

const uuid = z.string().uuid();
const dry = z.boolean().optional().default(false);

type Ctx = { admin: AdminClient; who: AdminIdentity };
type Handler = (body: unknown, ctx: Ctx) => Promise<Record<string, unknown>>;

const previewOr = <T>(dryRun: boolean, r: T, describe: (r: T) => Preview, summary: (r: T) => string) => (dryRun ? { preview: describe(r), result: r } : { summary: summary(r), result: r });

const HANDLERS: Record<string, Handler> = {
  "group-test": async (body, { admin }) => {
    const { groupId, isTest } = z.object({ groupId: uuid, isTest: z.boolean() }).parse(body);
    const g = await setGroupTest(admin, groupId, isTest);
    return { isTest: g.is_test, summary: isTest ? `"${g.name}" quedó marcado como de prueba.` : `"${g.name}" ya no es de prueba.` };
  },
  "delete-group": async (body, { admin, who }) => {
    const { groupId, deleteOrphans: orphans, dryRun } = z.object({ groupId: uuid, deleteOrphans: z.boolean().optional().default(false), dryRun: dry }).parse(body);
    const r = await deleteGroup(admin, { groupId, deleteOrphans: orphans, dryRun, adminEmail: who.email });
    return previewOr(dryRun, r, describeDeleteGroup, (x) => `listo: se borró "${x.group.name}" con ${x.members} integrantes, ${x.seasons} temporadas, ${x.rounds} rondas y ${x.attempts} intentos${x.deleted_users ? `, y ${x.deleted_users} usuarios que quedaban sin grupo` : ""}.`);
  },
  "delete-user": async (body, { admin, who }) => {
    const { profileId, dryRun } = z.object({ profileId: uuid, dryRun: dry }).parse(body);
    const r = await deleteUser(admin, { profileId, dryRun, adminEmail: who.email });
    return previewOr(dryRun, r, describeDeleteUser, (x) => `listo: se borró a ${x.user.name || "(sin nombre)"} con ${x.memberships} membresías, ${x.attempts} intentos y ${x.push} suscripciones.`);
  },
  "cleanup-test": async (body, { admin, who }) => {
    const { dryRun } = z.object({ dryRun: dry }).parse(body);
    const r = await cleanupTest(admin, { dryRun, adminEmail: who.email });
    return previewOr(dryRun, r, describeCleanup, (x) => `listo: se borraron ${x.deleted_groups} grupos de prueba y ${x.deleted_users} usuarios que quedaban sin grupo.`);
  },
  "delete-orphans": async (body, { admin, who }) => {
    const { dryRun } = z.object({ dryRun: dry }).parse(body);
    const r = await deleteOrphans(admin, { dryRun, adminEmail: who.email });
    return previewOr(dryRun, r, describeOrphans, (x) => `listo: se borraron ${x.deleted_users} usuarios sin grupo.`);
  },
  "remove-member": async (body, { admin, who }) => {
    const { groupId, profileId, dryRun } = z.object({ groupId: uuid, profileId: uuid, dryRun: dry }).parse(body);
    const r = await removeMember(admin, { groupId, profileId, dryRun, adminEmail: who.email });
    return previewOr(dryRun, r, describeRemoveMember, (x) => `listo: ${x.member.name} salió de "${x.group.name}"${x.attempts ? `, con ${x.attempts} intentos borrados` : ""}.`);
  },
  "change-owner": async (body, { admin, who }) => {
    const { groupId, profileId } = z.object({ groupId: uuid, profileId: uuid }).parse(body);
    const r = await changeOwner(admin, { groupId, profileId, adminEmail: who.email });
    return { summary: `listo: ${r.to.name} es el dueño de "${r.group.name}"${r.from.name ? ` (antes, ${r.from.name})` : ""}.`, result: r };
  },
  "reset-season": async (body, { admin, who }) => {
    const { groupId, dryRun } = z.object({ groupId: uuid, dryRun: dry }).parse(body);
    const { data: group, error } = await admin.from("groups").select("*").eq("id", groupId).maybeSingle();
    if (error) throw new Error(`groups: ${error.message}`);
    if (!group) throw new AdminActionError(404, "group_not_found", "ese grupo no existe.");
    const r = await resetSeason(admin, { group, dryRun, adminEmail: who.email, fakeToday: await readFakeToday() });
    return previewOr(dryRun, r, describeResetSeason, (x) => `listo: la temporada ${x.season_number} de "${x.group.name}" empieza de nuevo hoy; se borraron ${x.rounds} rondas y ${x.attempts} intentos.`);
  },
  "toggle-game": async (body, { admin, who }) => {
    const { gameId, enabled } = z.object({ gameId: z.string().min(1).max(40), enabled: z.boolean() }).parse(body);
    const r = await toggleGame(admin, { gameId, enabled, adminEmail: who.email });
    return { enabled: r.enabled, enabledCount: r.enabled_count, summary: enabled ? "entra en el mazo desde la próxima ronda." : "no sale en las rondas que se creen desde ahora; la de hoy no cambia." };
  },
  "push-test": async (_body, { admin, who }) => {
    const r = await sendTestPush(admin, { adminUserId: who.userId, adminEmail: who.email });
    return { ...r, summary: `enviada a ${r.sent} de tus ${r.subscriptions} ${r.subscriptions === 1 ? "dispositivo" : "dispositivos"}${r.failed ? `, ${r.failed} fallaron` : ""}${r.removed ? `, ${r.removed} vencidas borradas` : ""}.` };
  },
  "push-announce": async (body, { admin, who }) => {
    const { text, groupId, dryRun } = z.object({ text: z.string(), groupId: uuid.nullable().optional().default(null), dryRun: dry }).parse(body);
    const r = await sendAnnouncement(admin, { text, groupId, dryRun, adminEmail: who.email });
    return { ...r, summary: dryRun ? null : `enviado a ${r.sent} de ${r.recipients} ${r.recipients === 1 ? "persona" : "personas"}${r.failed ? `, ${r.failed} fallaron` : ""}${r.removed ? `, ${r.removed} vencidas borradas` : ""}.` };
  },
};

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const who = await currentAdmin();
  if (!who) return jsonError(403, "forbidden", "esto es solo para el admin.");
  const { action } = await params;
  const handler = HANDLERS[action];
  if (!handler) return jsonError(404, "unknown_action", "esa acción no existe.");
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const out = await handler(body, { admin: createAdminClient(), who });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof z.ZodError) return jsonError(400, "bad_body", "faltan datos o vienen mal.");
    if (e instanceof AdminActionError) return jsonError(e.status, e.code, e.message);
    console.error(e);
    return jsonError(500, "internal", "algo salió mal del lado del servidor.");
  }
}

export async function GET() {
  const who = await currentAdmin();
  if (!who) return jsonError(403, "forbidden", "esto es solo para el admin.");
  return jsonError(405, "method_not_allowed", "usá POST.");
}
