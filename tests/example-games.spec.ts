import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseProject } from "@mosaic/model";

const renderers = [
  { selection: "canvas", name: "Canvas 2D" },
  { selection: "pixi", name: "PixiJS accelerated" },
] as const;

async function openOffline(page: Page, name: string) {
  const unexpected: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) unexpected.push(request.url());
  });
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve("dist", name + ".html")).href);
  return unexpected;
}

for (const renderer of renderers) {
  test(`Lantern Courier completes an offline delivery in ${renderer.name}`, async ({
    page,
  }) => {
    const network = await openOffline(page, "lantern-courier");
    await page.locator("#backend").selectOption(renderer.selection);
    await expect(page.locator("#runtime-status")).toHaveText(renderer.name);
    await expect(page.locator("#game-title")).toHaveText("Lantern Courier");
    await page.getByRole("button", { name: "Start delivery" }).click();
    await expect(page.locator("#game")).toBeFocused();
    const hold = async (key: string, during: () => Promise<unknown>) => {
      await page.keyboard.down(key);
      try {
        await during();
      } finally {
        await page.keyboard.up(key);
      }
    };
    const reach = (label: string) =>
      expect(page.getByText(label, { exact: true }).first()).toBeVisible({
        timeout: 12000,
      });
    const clock = page.locator('[data-widget-id="clock"]');
    const secondsLeft = async () =>
      Number.parseInt(await clock.innerText(), 10);
    const moveToLane = async (key: string) => {
      // Two in-game seconds guarantee an unobstructed crossing to the wall
      // even when software rendering advances simulation slower than wall time.
      const before = await secondsLeft();
      await hold(key, () =>
        expect
          .poll(secondsLeft, { timeout: 12000 })
          .toBeLessThanOrEqual(before - 2),
      );
    };
    await moveToLane("ArrowUp");
    await hold("ArrowRight", () => reach("Stamps 1 / 3"));
    await moveToLane("ArrowDown");
    await hold("ArrowRight", () => reach("Stamps 2 / 3"));
    await moveToLane("ArrowUp");
    await hold("ArrowRight", () => reach("Delivery complete!"));
    await expect(page.getByText("Stamps 3 / 3", { exact: true })).toBeVisible();
    const best = await page.getByText(/^Best \d/).innerText();
    expect(best).toMatch(/^Best \d+(\.\d+)? s$/);
    await expect(page.locator("#runtime-error")).toHaveText("");
    await page.reload();
    await expect(page.getByText(best, { exact: true })).toBeVisible();
    expect(network).toEqual([]);
  });

  test(`Beacon Circuit solves three offline boards in ${renderer.name}`, async ({
    page,
  }) => {
    const network = await openOffline(page, "beacon-circuit");
    const mode = page.locator("#backend");
    await mode.selectOption(renderer.selection);
    await expect(page.locator("#runtime-status")).toHaveText(renderer.name);
    const beacon = (i: number) =>
      page.getByRole("button", { name: "Beacon " + i, exact: true });
    await expect(
      page.getByRole("progressbar", { name: "Beacons lit" }),
    ).toHaveAttribute("value", "4");
    await beacon(2).focus();
    await page.keyboard.press("ArrowDown");
    await expect(beacon(5)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Next circuit" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Circuit 2 / 3 · Twin relays")).toBeVisible();
    await beacon(1).click();
    const spare = renderers.find(
      ({ selection }) => selection !== renderer.selection,
    )!;
    await mode.selectOption(spare.selection);
    await expect(page.locator("#runtime-status")).toHaveText(spare.name);
    await expect(page.getByText("Moves 2", { exact: true })).toBeVisible();
    await mode.selectOption(renderer.selection);
    await expect(page.locator("#runtime-status")).toHaveText(renderer.name);
    await beacon(9).click();
    await page.getByRole("button", { name: "Next circuit" }).click();
    await expect(page.getByText("Circuit 3 / 3 · North circuit")).toBeVisible();
    for (const i of [2, 4, 9]) await beacon(i).click();
    await expect(page.getByText("All circuits restored!")).toBeVisible();
    await expect(page.getByText("Best 6", { exact: true })).toBeVisible();
    await expect(page.locator("#runtime-error")).toHaveText("");
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByText("Moves 0", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Best 6", { exact: true })).toBeVisible();
    expect(network).toEqual([]);
  });
}

test("both example documents survive editor save and reopen and produce standalone exports", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", "canvas");
  });
  await page.goto("http://127.0.0.1:5188/");
  const fromFile = async (label: string) => {
    await page
      .locator("details.menu > summary")
      .getByText("File", { exact: true })
      .click();
    await page.getByRole("button", { name: label, exact: true }).click();
  };
  for (const [id, title, rule] of [
    ["lantern-courier", "Lantern Courier", "Lantern Courier Rules"],
    ["beacon-circuit", "Beacon Circuit", "Beacon Circuit Rules"],
  ]) {
    await fromFile("Open " + title);
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    const source = await readFile((await (await downloaded).path())!, "utf8");
    const project = parseProject(source);
    expect(project).toEqual(
      parseProject(
        await readFile(resolve("dist", id + ".mosaic.json"), "utf8"),
      ),
    );
    expect(project.blueprints[0].name).toBe(rule);
    await fromFile("Open Lantern Ridge Sample");
    const chooser = page.waitForEvent("filechooser");
    await fromFile("Open Project");
    await (
      await chooser
    ).setFiles({
      name: id + ".mosaic.json",
      mimeType: "application/json",
      buffer: Buffer.from(source),
    });
    await expect(
      page.getByText("Project opened.", { exact: true }),
    ).toBeVisible();
    const exportDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const html = testInfo.outputPath(id + ".html");
    await (await exportDownload).saveAs(html);
    const player = await page.context().newPage();
    await player.goto(pathToFileURL(html).href);
    await player.locator("#backend").selectOption("canvas");
    await expect(player.locator("#game-title")).toHaveText(title);
    await expect(player.locator("#game canvas")).toBeVisible();
    await expect(player.locator("#runtime-error")).toHaveText("");
    await player.close();
  }
});
