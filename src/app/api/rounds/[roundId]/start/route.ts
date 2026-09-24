import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startAttempt } from "@/lib/attempts";
import { currentUserId, handleApiError, jsonError, readFakeToday } from "@/lib/api";

export const dynamic = "force-dynamic";

// POST /api/rounds/:roundId/start
// → verifica que quedan intentos, crea el attempt in_progress con
//   started_at = now() y devuelve { attemptId, seed, gameId, durationMs }.
export async function POST(_req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  try {
    const userId = await currentUserId();
    if (!userId) return jsonError(401, "not_authenticated", "se perdió la sesión. recargá la página.");
    const { roundId } = await ctx.params;
    const result = await startAttempt(createAdminClient(), userId, roundId, { fakeToday: await readFakeToday() });
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
