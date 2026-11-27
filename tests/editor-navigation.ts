import type { Page } from "@playwright/test";

export async function openEditor(page: Page, name: string) {
  await page
    .locator("details.menu > summary")
    .getByText("Editors", { exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Engine editors" })
    .getByRole("button", { name, exact: true })
    .click();
}
