import type { DateString } from "./time";

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
