import { describe, expect, it } from "vitest";
import { dayNumber, isReminderDue, localDate, localTime, pendingProfiles, REMINDER_MESSAGES, REMINDER_TITLE, reminderBodyFor, reminderMessageIndex } from "./reminders";

describe("isReminderDue", () => {
  it("cae en la ventana de 15 minutos a partir de la hora elegida, en la zona del grupo", () => {
    // 23:00 UTC = 20:00 en Montevideo (UTC-3)
    const at2000 = new Date("2026-09-24T23:00:00Z");
    expect(isReminderDue("20:00:00", "America/Montevideo", at2000)).toBe(true);
    expect(isReminderDue("20:00:00", "America/Montevideo", new Date("2026-09-24T23:14:59Z"))).toBe(true);
    expect(isReminderDue("20:00:00", "America/Montevideo", new Date("2026-09-24T23:15:00Z"))).toBe(false);
    expect(isReminderDue("20:00:00", "America/Montevideo", new Date("2026-09-24T22:59:00Z"))).toBe(false);
    // en Madrid (UTC+2 en septiembre) a esa hora UTC es la 1 de la mañana
    expect(isReminderDue("20:00:00", "Europe/Madrid", at2000)).toBe(false);
    expect(isReminderDue("01:00:00", "Europe/Madrid", at2000)).toBe(true);
  });

  it("sin hora no hay recordatorio (texto)", () => {
    expect(isReminderDue(null, "America/Montevideo", new Date())).toBe(false);
  });

  it("localTime y localDate respetan la zona", () => {
    const instant = new Date("2026-09-25T02:30:00Z");
    expect(localTime("America/Montevideo", instant)).toBe("23:30");
    expect(localDate("America/Montevideo", instant)).toBe("2026-09-24");
    expect(localDate("UTC", instant)).toBe("2026-09-25");
  });
});

describe("el texto del recordatorio", () => {
  const PROFILE = "6f3d7a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
  const OTHER = "0b1c2d3e-4f50-4617-a8b9-c0d1e2f3a4b5";

  it("son cuatro mensajes, copiados tal cual, con el título frog", () => {
    expect(REMINDER_TITLE).toBe("frog");
    expect(REMINDER_MESSAGES).toEqual(["Bro que masa no has jugado hoy", "Vas a jugar bro o sos un sopa barbaro?", "Pari es hora de jugar dale", "Juga Frog Juga Sabor"]);
  });

  it("dos días seguidos, la misma persona recibe mensajes distintos", () => {
    expect(reminderBodyFor(PROFILE, "2026-10-01")).not.toBe(reminderBodyFor(PROFILE, "2026-10-02"));
    expect(reminderBodyFor(OTHER, "2026-10-01")).not.toBe(reminderBodyFor(OTHER, "2026-10-02"));
    expect(dayNumber("2026-10-02") - dayNumber("2026-10-01")).toBe(1);
  });

  it("en cuatro días seguidos recibe los cuatro", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    const got = new Set(days.map((d) => reminderBodyFor(PROFILE, d)));
    expect(got.size).toBe(4);
    for (const m of REMINDER_MESSAGES) expect(got.has(m)).toBe(true);
    // y vuelve a empezar al quinto
    expect(reminderBodyFor(PROFILE, "2026-10-05")).toBe(reminderBodyFor(PROFILE, "2026-10-01"));
    // el índice se calcula con el día más un hash corto del perfil: dos personas no van en fase
    const idx = (p: string) => days.map((d) => reminderMessageIndex(p, d));
    expect(idx(PROFILE)).not.toEqual(idx(OTHER));
  });

  it("quien ya jugó no recibe nada", () => {
    expect(pendingProfiles([PROFILE, OTHER], [PROFILE])).toEqual([OTHER]);
    expect(pendingProfiles([PROFILE, OTHER], [PROFILE, OTHER])).toEqual([]);
    expect(pendingProfiles([PROFILE, OTHER], [])).toEqual([PROFILE, OTHER]);
  });
});
