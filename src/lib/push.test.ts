import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import webpush from "web-push";
import type { Database, GroupRow } from "@/lib/supabase/types";
import { localTime } from "./reminders";

// Envío de Web Push de verdad (cifrado aes128gcm + VAPID) contra un push
// service falso: un servidor HTTPS local con certificado autofirmado. Y el
// endpoint del recordatorio diario contra la base local. Corre solo si hay
// stack en SUPABASE_TEST_URL (o el emulador en :54321) y openssl.

const URL_ = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";

async function stackUp(): Promise<boolean> {
  try {
    return (await fetch(`${URL_}/auth/v1/health`)).ok;
  } catch {
    return false;
  }
}
function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const up = (await stackUp()) && hasOpenssl();

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

// una suscripción con claves válidas: p256dh es la pública ECDH P-256 (65 bytes), auth 16 bytes
function fakeSubscriptionKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(crypto.randomBytes(16)) };
}

describe.skipIf(!up)("web push contra un push service falso", () => {
  let server: https.Server;
  let port = 0;
  const received: Array<{ path: string; headers: Record<string, string | string[] | undefined>; bytes: number }> = [];
  let admin: SupabaseClient<Database>;
  let userId: string;
  let group: GroupRow;
  let push: typeof import("./push");
  let reminders: typeof import("@/app/api/push/reminders/route");

  beforeAll(async () => {
    // certificado autofirmado para 127.0.0.1
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playus-push-"));
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "key.pem"),
      "-out", path.join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1",
    ], { stdio: "ignore" });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    server = https.createServer({ key: fs.readFileSync(path.join(dir, "key.pem")), cert: fs.readFileSync(path.join(dir, "cert.pem")) }, (req, res) => {
      let bytes = 0;
      req.on("data", (c: Buffer) => (bytes += c.length));
      req.on("end", () => {
        received.push({ path: req.url ?? "", headers: req.headers, bytes });
        res.statusCode = req.url?.startsWith("/gone") ? 410 : 201;
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;

    // VAPID y cron para este proceso, antes de importar los módulos que los leen
    const vapid = webpush.generateVAPIDKeys();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@playus.local";
    process.env.CRON_SECRET = "secreto-de-prueba";
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
    const jwt = await import("jsonwebtoken");
    const sign = (role: string) => jwt.default.sign({ iss: "supabase", role, iat: 1700000000, exp: 2000000000 }, SECRET);
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY ?? sign("service_role");
    push = await import("./push");
    reminders = await import("@/app/api/push/reminders/route");

    admin = createClient<Database>(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const user = createClient<Database>(URL_, process.env.SUPABASE_TEST_ANON_KEY ?? sign("anon"), { auth: { persistSession: false } });
    const { data: s } = await user.auth.signInAnonymously();
    userId = s.user!.id;
    const { data: g, error } = await user.rpc("create_group", { p_name: "grupo push" });
    if (error) throw error;
    group = g;

    const ok = fakeSubscriptionKeys();
    const gone = fakeSubscriptionKeys();
    const { error: insErr } = await admin.from("push_subscriptions").insert([
      { profile_id: userId, endpoint: `https://127.0.0.1:${port}/ok/${crypto.randomUUID()}`, ...ok },
      { profile_id: userId, endpoint: `https://127.0.0.1:${port}/gone/${crypto.randomUUID()}`, ...gone },
    ]);
    if (insErr) throw insErr;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("manda un push cifrado con VAPID y borra la suscripción vencida (410)", async () => {
    expect(push.pushConfigured()).toBe(true);
    const report = await push.sendPushToProfiles(admin, [userId], { title: "hola", body: "prueba", url: "/hoy" });
    expect(report).toEqual({ sent: 1, failed: 0, removed: 1 });

    const okReq = received.find((r) => r.path.startsWith("/ok/"));
    expect(okReq).toBeDefined();
    expect(okReq!.headers["content-encoding"]).toBe("aes128gcm");
    expect(String(okReq!.headers.authorization)).toMatch(/^vapid t=.+, k=.+/);
    expect(okReq!.headers.ttl).toBeDefined();
    expect(okReq!.bytes).toBeGreaterThan(0);

    const { data: left } = await admin.from("push_subscriptions").select("endpoint").eq("profile_id", userId);
    expect(left?.map((r) => r.endpoint.includes("/gone/"))).toEqual([false]);
  });

  it("el endpoint de recordatorios avisa a quien no jugó, una sola vez por día, y exige el secreto", async () => {
    const unauthorized = await reminders.GET(new Request("http://localhost/api/push/reminders"));
    expect(unauthorized.status).toBe(401);

    // el grupo está "en hora" ahora mismo
    const now = localTime(group.timezone, new Date());
    const { error } = await admin.from("groups").update({ reminder_time: `${now}:00` }).eq("id", group.id);
    expect(error).toBeNull();

    const before = received.length;
    const res = await reminders.GET(new Request("http://localhost/api/push/reminders", { headers: { authorization: "Bearer secreto-de-prueba" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; groups: Array<{ group: string; sent: number; skipped?: string }> };
    const mine = body.groups.find((g) => g.group === group.id);
    expect(mine).toMatchObject({ sent: 1 });
    expect(received.length).toBe(before + 1);

    // se creó la ronda de hoy y quedó registrado el envío
    const { data: rem } = await admin.from("group_reminders").select("*").eq("group_id", group.id);
    expect(rem?.length).toBe(1);
    expect(rem?.[0]?.sent_count).toBe(1);

    // segunda corrida en la misma ventana: no repite
    const again = await reminders.GET(new Request("http://localhost/api/push/reminders", { headers: { authorization: "Bearer secreto-de-prueba" } }));
    const body2 = (await again.json()) as { groups: Array<{ group: string; sent: number; skipped?: string }> };
    expect(body2.groups.find((g) => g.group === group.id)).toMatchObject({ sent: 0, skipped: "ya enviado" });
    expect(received.length).toBe(before + 1);
  });
});
