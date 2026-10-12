import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import { AdminActionError } from "./admin-actions";
import { pushConfigured, sendPushToProfiles, type SendReport } from "./push";

// Avisos desde el panel (decisión 282): una notificación de prueba solo a las
// suscripciones del admin, y anuncios a todos los que tienen avisos activados
// o a un grupo. El título es siempre "frog". Un anuncio cada 10 minutos, para
// no spamear por error. Las suscripciones vencidas se borran solas (lo hace
// sendPushToProfiles). Todo queda en el registro.

export const PUSH_TITLE = "frog";
export const ANNOUNCE_MAX_CHARS = 120;
export const ANNOUNCE_COOLDOWN_MS = 10 * 60 * 1000;
export const TEST_BODY = "esta es una de prueba. si la ves, el push anda.";

/** perfiles con al menos una suscripción de avisos; de un grupo, o de todos */
export async function pushRecipients(admin: AdminClient, groupId: string | null): Promise<string[]> {
  const subs = new Set<string>();
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await admin.from("push_subscriptions").select("profile_id").order("id").range(from, from + size - 1);
    if (error) throw new Error(`push_subscriptions: ${error.message}`);
    for (const s of data ?? []) subs.add(s.profile_id);
    if (!data || data.length < size) break;
  }
  if (groupId === null) return [...subs];
  const { data: members, error } = await admin.from("group_members").select("profile_id").eq("group_id", groupId);
  if (error) throw new Error(`group_members: ${error.message}`);
  return (members ?? []).map((m) => m.profile_id).filter((id) => subs.has(id));
}

/** cuándo salió el último anuncio, o null */
export async function lastAnnouncement(admin: AdminClient): Promise<Date | null> {
  const { data, error } = await admin.from("admin_actions").select("created_at").eq("action", "push_announce").order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(`admin_actions: ${error.message}`);
  return data?.[0] ? new Date(data[0].created_at) : null;
}

/** null si ya se puede mandar otro; si no, desde cuándo (puro, para los tests) */
export function announceAllowedAt(last: Date | null, now: Date = new Date()): Date | null {
  if (!last) return null;
  const at = new Date(last.getTime() + ANNOUNCE_COOLDOWN_MS);
  return at.getTime() > now.getTime() ? at : null;
}

/** el texto, recortado y validado (puro) */
export function parseAnnouncement(text: unknown): string {
  if (typeof text !== "string") throw new AdminActionError(400, "bad_text", "falta el texto.");
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) throw new AdminActionError(400, "bad_text", "el texto está vacío.");
  if (t.length > ANNOUNCE_MAX_CHARS) throw new AdminActionError(400, "bad_text", `el texto tiene ${t.length} caracteres; el máximo es ${ANNOUNCE_MAX_CHARS}.`);
  return t;
}

async function log(admin: AdminClient, adminEmail: string, action: "push_test" | "push_announce", groupId: string | null, target: string, details: Record<string, string | number | boolean | null>) {
  const { error } = await admin.rpc("admin_log", { p_admin_email: adminEmail, p_action: action, p_group_id: groupId, p_target: target, p_details: details });
  if (error) throw new Error(`admin_log: ${error.message}`);
}

export interface TestPushResult extends SendReport {
  subscriptions: number;
}

/** una notificación de prueba, solo a las suscripciones del admin */
export async function sendTestPush(admin: AdminClient, opts: { adminUserId: string; adminEmail: string }): Promise<TestPushResult> {
  if (!pushConfigured()) throw new AdminActionError(503, "push_not_configured", "faltan las claves VAPID: el push no está configurado.");
  const { data: subs, error } = await admin.from("push_subscriptions").select("id").eq("profile_id", opts.adminUserId);
  if (error) throw new Error(`push_subscriptions: ${error.message}`);
  const subscriptions = subs?.length ?? 0;
  if (subscriptions === 0) throw new AdminActionError(409, "no_subscription", "no tenés avisos activados en ningún dispositivo: activalos en Perfil y probá de nuevo.");
  const report = await sendPushToProfiles(admin, [opts.adminUserId], { title: PUSH_TITLE, body: TEST_BODY, url: "/hoy", tag: "admin-prueba" });
  await log(admin, opts.adminEmail, "push_test", null, opts.adminEmail, { ...report, subscriptions });
  return { ...report, subscriptions };
}

export interface AnnouncementResult extends SendReport {
  text: string;
  /** a quién fue: "todos" o el nombre del grupo */
  to: string;
  groupId: string | null;
  recipients: number;
  /** si todavía no se puede mandar otro, desde cuándo */
  allowedAt: string | null;
}

/**
 * Un anuncio a todos los que tienen avisos activados o a un grupo. Con
 * dryRun devuelve a cuántas personas iría y si el límite de 10 minutos lo
 * deja, sin mandar nada.
 */
export async function sendAnnouncement(admin: AdminClient, opts: { text: unknown; groupId: string | null; adminEmail: string; dryRun: boolean; now?: Date }): Promise<AnnouncementResult> {
  const text = parseAnnouncement(opts.text);
  let to = "todos";
  if (opts.groupId !== null) {
    const { data: group, error } = await admin.from("groups").select("name").eq("id", opts.groupId).maybeSingle();
    if (error) throw new Error(`groups: ${error.message}`);
    if (!group) throw new AdminActionError(404, "group_not_found", "ese grupo no existe.");
    to = group.name;
  }
  const [recipients, last] = await Promise.all([pushRecipients(admin, opts.groupId), lastAnnouncement(admin)]);
  const allowedAt = announceAllowedAt(last, opts.now);
  const base = { text, to, groupId: opts.groupId, recipients: recipients.length, allowedAt: allowedAt?.toISOString() ?? null, sent: 0, failed: 0, removed: 0 };
  if (opts.dryRun) return base;
  if (allowedAt) throw new AdminActionError(429, "too_soon", `hubo un anuncio hace menos de 10 minutos. se puede mandar otro a las ${allowedAt.toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}.`);
  if (!pushConfigured()) throw new AdminActionError(503, "push_not_configured", "faltan las claves VAPID: el push no está configurado.");
  const report = await sendPushToProfiles(admin, recipients, { title: PUSH_TITLE, body: text, url: "/hoy", tag: `anuncio-${Date.now()}` });
  await log(admin, opts.adminEmail, "push_announce", opts.groupId, to, { text, to, recipients: recipients.length, ...report });
  return { ...base, ...report };
}
