import type { DateString } from "./time";
import { hash32 } from "./rng";

// El recordatorio diario: cada grupo elige una hora local. Un scheduler llama
// al endpoint cada 15 minutos y acá se decide si un grupo "está en hora":
// la hora local actual cae en [reminder_time, reminder_time + ventana).
// Función pura; la idempotencia (no mandar dos veces el mismo día) la da
// la tabla group_reminders.

export const REMINDER_WINDOW_MINUTES = 15;

/** "HH:MM" local de un instante en una zona horaria. */
export function localTime(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** Fecha local "YYYY-MM-DD" (misma que todayInTz, repetida acá para no importar time.ts en el SW). */
export function localDate(tz: string, now: Date): DateString {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function minutesOf(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * ¿Toca mandar el recordatorio ahora? `reminderTime` viene de la base como
 * "HH:MM:SS". La ventana cubre exactamente una corrida del scheduler; con
 * corridas cada 15 minutos, cada hora elegida cae en una sola ventana.
 */
export function isReminderDue(
  reminderTime: string | null,
  tz: string,
  now: Date,
  windowMinutes = REMINDER_WINDOW_MINUTES,
): boolean {
  if (!reminderTime) return false;
  const target = minutesOf(reminderTime);
  const current = minutesOf(localTime(tz, now));
  return current >= target && current < target + windowMinutes;
}

// ---------------------------------------------------------------------------
// el texto del recordatorio: cuatro mensajes que van variando por persona y
// por día. Para sumar o cambiar mensajes, tocá solo esta lista.
// ---------------------------------------------------------------------------

export const REMINDER_TITLE = "frog";
export const REMINDER_MESSAGES: readonly string[] = ["Bro que masa no has jugado hoy", "Vas a jugar bro o sos un sopa barbaro?", "Pari es hora de jugar dale", "Juga Frog Juga Sabor"];

/** número de día (días desde 1970) de una fecha local "YYYY-MM-DD" */
export function dayNumber(date: DateString): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/**
 * Qué mensaje le toca a una persona un día: (número de día + hash corto del
 * profile_id) módulo la cantidad de mensajes. Cada persona recorre los
 * cuatro en cuatro días seguidos, y no a todos los del grupo les llega el
 * mismo el mismo día.
 */
export function reminderMessageIndex(profileId: string, date: DateString, count = REMINDER_MESSAGES.length): number {
  return (((dayNumber(date) + (hash32(profileId) % 1000)) % count) + count) % count;
}

export function reminderBodyFor(profileId: string, date: DateString): string {
  return REMINDER_MESSAGES[reminderMessageIndex(profileId, date)]!;
}

/** quiénes reciben el recordatorio: los integrantes que todavía no completaron una partida ese día */
export function pendingProfiles(members: readonly string[], completed: readonly string[]): string[] {
  const played = new Set(completed);
  return members.filter((id) => !played.has(id));
}
