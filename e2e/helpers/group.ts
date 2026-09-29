import { expect, type Page } from "@playwright/test";

// Crea grupos hasta que el juego de hoy sea el pedido (el mazo se baraja por
// grupo, así que con seis juegos cada grupo nuevo tiene una chance de
// seis; en 32 grupos, no encontrarlo tiene un 0,3 % de probabilidad).
// Devuelve el código de invitación del grupo elegido.
export async function createGroupWithGame(page: Page, name: string, gameName: string, tries = 32): Promise<string> {
  for (let i = 0; i < tries; i++) {
    await page.goto("/crear");
    // la primera vez pide nombre y avatar; las siguientes, la cuenta ya tiene nombre
    const nameField = page.getByPlaceholder("tu nombre");
    const groupField = page.getByPlaceholder("los del barrio");
    await expect(nameField.or(groupField)).toBeVisible();
    if (await nameField.isVisible()) {
      await nameField.fill(name);
      await page.getByRole("button", { name: "seguir" }).click();
    }
    await groupField.fill(`${gameName.slice(0, 12)} ${i + 1}`);
    await page.getByRole("button", { name: "crear grupo" }).click();
    await expect(page).toHaveURL(/\/grupo$/);
    const code = (await page.getByTestId("invite-code").textContent())?.trim() ?? "";
    await page.goto("/hoy");
    const today = (await page.getByTestId("today-game-name").textContent())?.trim();
    if (today === gameName) {
      console.log(`grupo con "${gameName}" al intento ${i + 1}`);
      return code;
    }
  }
  throw new Error(`en ${tries} grupos nunca tocó ${gameName}`);
}
