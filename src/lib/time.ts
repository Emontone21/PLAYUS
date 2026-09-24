// Fechas de calendario ("YYYY-MM-DD") en la zona horaria de cada grupo.
// El día corta a las 00:00 de esa zona, no en UTC.

export type DateString = string; // YYYY-MM-DD

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Fecha de hoy en una zona horaria IANA. */
export function todayInTz(tz: string, now: Date = new Date()): DateString {
  // en-CA da YYYY-MM-DD
  return formatter(tz).format(now);
}

export function isDateString(value: unknown): value is DateString {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

/** Suma días a una fecha de calendario (sin zonas horarias de por medio). */
export function addDays(date: DateString, days: number): DateString {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días enteros de `from` a `to` (to - from). */
export function daysBetween(from: DateString, to: DateString): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "mié 24 sep" para mostrar. */
export function formatShortDate(date: DateString, tz = "UTC"): string {
  return new Intl.DateTimeFormat("es-UY", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
