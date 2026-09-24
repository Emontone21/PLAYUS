import { describe, expect, it } from "vitest";
import { addDays, daysBetween, todayInTz } from "./time";

describe("todayInTz", () => {
  it("el día corta a las 00:00 de la zona del grupo, no en UTC", () => {
    // 02:30 UTC del 25 son las 23:30 del 24 en Montevideo (UTC-3)
    const instant = new Date("2026-09-25T02:30:00Z");
    expect(todayInTz("America/Montevideo", instant)).toBe("2026-09-24");
    expect(todayInTz("UTC", instant)).toBe("2026-09-25");
    expect(todayInTz("Asia/Tokyo", instant)).toBe("2026-09-25");
  });
});

describe("addDays / daysBetween", () => {
  it("suma y resta cruzando meses y años", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-09-18", 29)).toBe("2026-10-17");
    expect(daysBetween("2026-09-18", "2026-10-17")).toBe(29);
    expect(daysBetween("2026-09-24", "2026-09-24")).toBe(0);
  });
});
