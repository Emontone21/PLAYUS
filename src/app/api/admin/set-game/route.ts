import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { AdminActionError, DECK, setTodayGame } from "@/lib/admin-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGame } from "@/games";
import { jsonError, readFakeToday } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/admin/set-game   body: { groupId, gameId }   (gameId: un id del registro o "deck")
// → solo el admin (403 si no). Cambia el juego de hoy del grupo en una
//   transacción, borra los intentos de hoy y deja registro.
export async function POST(req: Request) {
  const who = await currentAdmin();
  if (!who) return jsonError(403, "forbidden", "esto es solo para el admin.");
  let body: { groupId?: unknown; gameId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const { groupId, gameId } = body;
  if (typeof groupId !== "string" || typeof gameId !== "string") return jsonError(400, "bad_body", "faltan el grupo o el juego.");
  if (gameId !== DECK && !getGame(gameId)) return jsonError(400, "unknown_game", "ese juego no está en el registro.");
  try {
    const admin = createAdminClient();
    const { data: group, error } = await admin.from("groups").select("*").eq("id", groupId).maybeSingle();
    if (error) throw new Error(`groups: ${error.message}`);
    if (!group) return jsonError(404, "group_not_found", "ese grupo no existe.");
    const result = await setTodayGame(admin, { group, gameId, adminEmail: who.email, fakeToday: await readFakeToday() });
    return NextResponse.json({ ok: true, ...result, toGameName: getGame(result.toGameId)?.name ?? result.toGameId });
  } catch (e) {
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
