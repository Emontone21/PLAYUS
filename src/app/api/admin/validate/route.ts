import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin";
import { AdminActionError, validateForAdmin } from "@/lib/admin-actions";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/admin/validate   body: { gameId, seed, result: { score, events }, elapsedMs }
// → solo el admin (403 si no). Corre las mismas comprobaciones que /finish
//   (duración, cotas y validate del juego) sobre una partida de prueba y
//   devuelve si pasa y, si no, el motivo. No escribe nada en la base.
export async function POST(req: Request) {
  const who = await currentAdmin();
  if (!who) return jsonError(403, "forbidden", "esto es solo para el admin.");
  let body: { gameId?: unknown; seed?: unknown; result?: unknown; elapsedMs?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const { gameId, seed, result, elapsedMs } = body;
  if (typeof gameId !== "string" || typeof seed !== "string" || typeof elapsedMs !== "number") return jsonError(400, "bad_body", "faltan el juego, la semilla o la duración.");
  try {
    const v = await validateForAdmin(gameId, seed, result, elapsedMs);
    return NextResponse.json({ ok: true, ...v });
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
