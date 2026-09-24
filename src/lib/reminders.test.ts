import { describe, expect, it } from "vitest";
import { isReminderDue, localDate, localTime } from "./reminders";

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

  it("sin hora no hay recordatorio", () => {
    expect(isReminderDue(null, "America/Montevideo", new Date())).toBe(false);
  });

  it("localTime y localDate respetan la zona", () => {
    const instant = new Date("2026-09-25T02:30:00Z");
    expect(localTime("America/Montevideo", instant)).toBe("23:30");
    expect(localDate("America/Montevideo", instant)).toBe("2026-09-24");
    expect(localDate("UTC", instant)).toBe("2026-09-25");
  });
});
