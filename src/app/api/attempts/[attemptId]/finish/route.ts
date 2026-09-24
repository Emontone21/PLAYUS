import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishAttempt } from "@/lib/attempts";
import { currentUserId, handleApiError, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/attempts/:attemptId/finish   body: { score, events }
// → rechaza si el attempt no existe, no es tuyo o ya terminó; si la duración
//   queda fuera de [minDurationMs, durationMs + 10s]; si el puntaje queda
//   fuera de [minPlausibleScore, maxPlausibleScore]; o si validate() falla.
//   Si pasa: status completed y guarda el puntaje.
export async function POST(req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  try {
    const userId = await currentUserId();
    if (!userId) return jsonError(401, "not_authenticated", "se perdió la sesión. recargá la página.");
    const { attemptId } = await ctx.params;
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const result = await finishAttempt(createAdminClient(), userId, attemptId, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return handleApiError(e);
  }
}
