import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseProject } from "@mosaic/model";

test("drags blocks into nested stacks and scoped getters into typed expression slots", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", "canvas");
  });
  await page.goto("http://127.0.0.1:5188/");
  await expect(
    page.getByRole("heading", { name: "Player Movement" }),
  ).toBeVisible();
  const library = page.getByRole("complementary", { name: "Block Library" });
  const query = library.getByLabel("Search blocks");
  const pick = async (search: string, name: string) => {
    await query.fill(search);
    return library.getByRole("button", { name, exact: true });
  };
  const root = page.locator('[data-stack="event"]').first();
  await (await pick("if", "If")).dragTo(root.locator(":scope > .add-block"));
  const inserted = root.locator(":scope > .logic-card").last();
  await expect(
    inserted.getByRole("button", { name: "If", exact: true }),
  ).toBeVisible();
  const then = inserted.locator('[data-stack="then"]');
  await (
    await pick("sprite.frameX", "Set Frame X")
  ).dragTo(then.locator(":scope > .add-block"));
  const sprite = then.locator(":scope > .logic-card").last();
  const slot = sprite.getByRole("button", {
    name: "Edit Property value",
    exact: true,
  });
  await expect(slot).toBeVisible();
  await (await pick("entity.visible", "Get Visible")).dragTo(slot);
  await expect(slot).toHaveText("0");
  await (await pick("sprite.frameX", "Get Frame X")).dragTo(slot);
  await expect(slot).toContainText("Frame X");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(slot).toHaveText("0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(slot).toContainText("Frame X");

  await (
    await pick("log", "Log")
  ).dragTo(inserted.locator('[data-stack="else"] > .add-block'));
  const logger = inserted.locator('[data-stack="else"] .logic-card').last();
  const logHeader = logger.getByRole("button", { name: "Log", exact: true });
  await logHeader.dragTo(
    sprite.getByRole("button", { name: "Set Frame X", exact: true }),
  );
  await expect(
    then.getByRole("button", { name: "Log", exact: true }),
  ).toBeVisible();
  const logValue = then.getByRole("button", {
    name: "Edit Log value",
    exact: true,
  });
  await (await pick("variable", "Get Variable")).click();
  await logValue.focus();
  await page.keyboard.press("Enter");
  await expect(logValue).not.toContainText("Hello from Mosaic");

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const transfer = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = parseProject(
    await readFile((await (await transfer).path())!, "utf8"),
  );
  expect(JSON.stringify(data.blueprints)).toContain('"member":"sprite.frameX"');
  expect(
    data.blueprints.some(({ events }) =>
      events.some(({ blocks }) =>
        blocks.some(
          (block) =>
            block.kind === "if" &&
            block.then.some((child) => child.kind === "runtimeWrite"),
        ),
      ),
    ),
  ).toBe(true);
  const exportGame = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = testInfo.outputPath("runtime-blueprint.html");
  await (await exportGame).saveAs(file);
  const offline = await page.context().newPage();
  await offline.context().setOffline(true);
  await offline.goto(pathToFileURL(file).href);
  for (const [renderer, caption] of [
    ["canvas", "Canvas 2D"],
    ["pixi", "PixiJS accelerated"],
  ]) {
    await offline.locator("#backend").selectOption(renderer);
    await expect(offline.locator("#runtime-status")).toHaveText(caption);
    await expect(offline.locator("#game canvas")).toBeVisible();
    await expect(offline.locator("#runtime-error")).toBeEmpty();
  }
});
