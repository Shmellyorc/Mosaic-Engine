import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function offline(page: Page, file: string, backend: "canvas" | "pixi") {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve("dist", file + ".html")).href);
  await page.locator("#backend").selectOption(backend);
  await expect(page.locator("#runtime-status")).toHaveText(
    backend === "canvas" ? "Canvas 2D" : "PixiJS accelerated",
  );
  return requests;
}
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
for (const backend of ["canvas", "pixi"] as const) {
  test(`Relay Isles restores three relays offline with ${backend}`, async ({
    page,
  }) => {
    const requests = await offline(page, "relay-isles", backend);
    await button(page, "Enable audio").click();
    await expect(button(page, "Enable audio")).toBeHidden();
    await button(page, "Instructions").click();
    const resume = button(page, "Continue voyage");
    await expect(resume).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(resume).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(button(page, "Instructions")).toBeFocused();
    await button(page, "Warehouse").click();
    await expect(
      page.getByText("Wrong relay. Read the tide chart and try again."),
    ).toBeVisible();
    await button(page, "Bridge").click();
    await expect(page.getByText("Relays 1 / 3", { exact: true })).toBeVisible();
    await button(page, "High tower").click();
    await expect(page.getByText("Relays 2 / 3", { exact: true })).toBeVisible();
    await button(page, "West battery").click();
    await expect(page.getByText("All relays restored!")).toBeVisible();
    await expect(page.getByText("Relays 3 / 3", { exact: true })).toBeVisible();
    await expect(page.locator("#runtime-error")).toBeEmpty();
    expect(requests).toEqual([]);
  });
  test(`Tideglass balances three gauges offline with ${backend}`, async ({
    page,
  }) => {
    const requests = await offline(page, "tideglass", backend);
    const seal = button(page, "Seal station");
    const open = button(page, "Open +2");
    const vent = button(page, "Vent −1");
    await seal.click();
    await expect(
      page.getByText("Gauge off target. Adjust and try again."),
    ).toBeVisible();
    await open.click();
    await seal.click();
    await expect(page.getByText("Target 2", { exact: true })).toBeVisible();
    for (let n = 0; n < 3; n++) await vent.click();
    await seal.click();
    await expect(page.getByText("Target 6", { exact: true })).toBeVisible();
    await open.click();
    await open.click();
    await seal.click();
    await expect(page.getByText("Tidegate stabilized!")).toBeVisible();
    await expect(
      page.getByText("Stations 3 / 3", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#runtime-error")).toBeEmpty();
    expect(requests).toEqual([]);
  });
}
