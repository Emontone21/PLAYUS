import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AttemptError } from "./attempts";
import { isDateString, type DateString } from "./time";

export const FAKE_TODAY_COOKIE = "playus-fake-today";

/** Fecha simulada para desarrollo: variable DEV_FAKE_TODAY o cookie del /dev/hoy. Nunca en producción. */
export async function readFakeToday(): Promise<DateString | null> {
  if (process.env.NODE_ENV === "production") return null;
  const fromCookie = (await cookies()).get(FAKE_TODAY_COOKIE)?.value;
  if (isDateString(fromCookie)) return fromCookie;
  const fromEnv = process.env.DEV_FAKE_TODAY;
  return isDateString(fromEnv) ? fromEnv : null;
}

/** Usuario de la sesión (cookies) o null. */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status });
}

export function handleApiError(e: unknown) {
  if (e instanceof AttemptError) return jsonError(e.status, e.code, e.message);
  console.error(e);
  return jsonError(500, "internal", "algo salió mal del lado del servidor.");
}
