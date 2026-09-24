import "server-only";

import webpush from "web-push";
import type { AdminClient } from "@/lib/supabase/admin";

// Envío de Web Push con VAPID. Las suscripciones vencidas (404/410) se borran.
// Sin claves VAPID configuradas, no manda nada y lo dice.

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hola@playus.app";
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface SendReport {
  sent: number;
  failed: number;
  removed: number;
}

/** Manda el mismo aviso a todas las suscripciones de esos perfiles. */
export async function sendPushToProfiles(
  admin: AdminClient,
  profileIds: readonly string[],
  payload: PushPayload,
  opts: { ttlSeconds?: number } = {},
): Promise<SendReport> {
  const report: SendReport = { sent: 0, failed: 0, removed: 0 };
  if (profileIds.length === 0 || !pushConfigured()) return report;

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", [...profileIds]);
  if (error) throw new Error(`push_subscriptions: ${error.message}`);

  const body = JSON.stringify(payload);
  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: opts.ttlSeconds ?? 6 * 60 * 60, urgency: "normal" },
        );
        report.sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          report.removed += 1;
        } else {
          report.failed += 1;
          console.error(`push a ${sub.endpoint.slice(0, 40)}… falló: ${status ?? (e as Error).message}`);
        }
      }
    }),
  );
  return report;
}
