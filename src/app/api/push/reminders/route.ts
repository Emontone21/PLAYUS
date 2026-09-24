import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGame } from "@/games";
import { ensureRound } from "@/lib/rounds";
import { isReminderDue, localDate } from "@/lib/reminders";
import { pushConfigured, sendPushToProfiles } from "@/lib/push";

export const dynamic = "force-dynamic";

// El único cron del proyecto (decisión 7). Lo llama pg_cron + pg_net cada
// 15 minutos (o cualquier scheduler) con Authorization: Bearer CRON_SECRET.
// Para cada grupo cuya hora local de recordatorio cae en esta ventana y que
// todavía no recibió el de hoy: asegura la ronda, y avisa a los integrantes
// que aún no completaron una partida. group_reminders evita repetir.
export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, message: "faltan las claves VAPID" }, { status: 503 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const { data: groups, error } = await admin.from("groups").select("*").not("reminder_time", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary: Array<{ group: string; date: string; sent: number; skipped?: string }> = [];

  for (const group of groups ?? []) {
    if (!isReminderDue(group.reminder_time, group.timezone, now)) continue;
    const today = localDate(group.timezone, now);

    // reservar el envío de hoy: si ya existe la fila, otro proceso lo mandó
    const { error: claimErr } = await admin.from("group_reminders").insert({ group_id: group.id, play_date: today });
    if (claimErr) {
      summary.push({ group: group.id, date: today, sent: 0, skipped: claimErr.code === "23505" ? "ya enviado" : claimErr.message });
      continue;
    }

    const round = await ensureRound(admin, group, today);
    const game = getGame(round.game_id);

    const [{ data: members }, { data: done }] = await Promise.all([
      admin.from("group_members").select("profile_id").eq("group_id", group.id),
      admin.from("attempts").select("profile_id").eq("round_id", round.id).eq("status", "completed"),
    ]);
    const played = new Set((done ?? []).map((a) => a.profile_id));
    const pending = (members ?? []).map((m) => m.profile_id).filter((id) => !played.has(id));

    const report = await sendPushToProfiles(admin, pending, {
      title: `${group.name}: hoy toca ${game?.name ?? round.game_id}`,
      body: "todavía no jugaste. si no jugás hoy, mañana ya no vale.",
      url: "/hoy",
      tag: `recordatorio-${group.id}-${today}`,
    });
    await admin.from("group_reminders").update({ sent_count: report.sent }).eq("group_id", group.id).eq("play_date", today);
    summary.push({ group: group.id, date: today, sent: report.sent });
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), groups: summary });
}
