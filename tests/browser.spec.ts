import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseProject } from "@mosaic/model";

const url = "http://127.0.0.1:5188";
async function editor(page: Page, renderer: "canvas" | "auto" = "canvas") {
  await page.addInitScript((renderer) => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", renderer);
  }, renderer);
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Player Movement" }),
  ).toBeVisible();
}
async function fileMenu(page: Page, name: string) {
  await page
    .locator("details.menu > summary")
    .getByText("File", { exact: true })
    .click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function pixels(canvas: Locator, points: [number, number][]) {
  const screenshot = await canvas.screenshot({ animations: "disabled" });
  return await canvas.page().evaluate(
    async ({ bytes, points }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + bytes;
      await image.decode();
      const copy = document.createElement("canvas");
      copy.width = image.naturalWidth;
      copy.height = image.naturalHeight;
      const ctx = copy.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return points.map(([x, y]) => [
        ...ctx
          .getImageData(
            Math.floor(x * copy.width),
            Math.floor(y * copy.height),
            1,
            1,
          )
          .data.slice(0, 3),
      ]);
    },
    { bytes: screenshot.toString("base64"), points },
  );
}

test("browser authoring covers nested tiles, workspace tabs, undo/redo, and IndexedDB restore", async ({
  page,
}) => {
  await editor(page);
  const stack = page.locator('[data-block-id="when-moving"]');
  await stack.getByLabel("Add block to then").selectOption("log");
  const added = stack.getByRole("button", { name: "Log", exact: true });
  await expect(added).toBeVisible();
  await added.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(
    stack.locator(".branch-stack > .card-list > article").nth(1),
  ).toContainText("Log");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    stack.locator(".branch-stack > .card-list > article").last(),
  ).toContainText("Log");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(added).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(added).toBeVisible();
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  await page
    .getByRole("button", { name: "Entity", exact: true })
    .first()
    .click();
  const name = page.getByLabel("Entity name");
  await expect(name).toHaveValue("Entity");
  await name.fill("Trail Marker");
  await expect(name).toHaveValue("Trail Marker");
  await name.press("Enter");
  await page.getByRole("button", { name: "Blueprints", exact: true }).click();
  await expect(added).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open("mosaic-editor", 1);
            open.onsuccess = () => {
              const db = open.result;
              const result = db
                .transaction("workspace")
                .objectStore("workspace")
                .get("autosave");
              result.onsuccess = () => {
                resolve(
                  result.result?.source.includes("Trail Marker") ?? false,
                );
                db.close();
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(
    stack.getByRole("button", { name: "Log", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  await expect(page.getByLabel("Entity name")).toHaveValue("Trail Marker");
});

test("play mode moves the player, pauses, restarts, and renders through either backend", async ({
  page,
}) => {
  await editor(page, "auto");
  const renderer = page.getByTestId("preview-backend");
  await expect(renderer).toHaveText("PixiJS");
  const position = page.getByTestId("runtime-position");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(position).toHaveText("Position 385.0, 271.0");
  await page.getByLabel("Focus game controls").focus();
  await page.keyboard.down("KeyD");
  await expect(position).not.toHaveText("Position 385.0, 271.0");
  await page.keyboard.up("KeyD");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await position.innerText();
  await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Renderer preference").selectOption("canvas");
  await expect(renderer).toHaveText("Canvas 2D");
  await expect(position).toHaveText(paused);
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(position).toHaveText("Position 385.0, 271.0");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(position).toHaveText("No runtime entity selected");
});

test("the exported sample opens offline and shows comparable pixels in PixiJS and Canvas 2D", async ({
  page,
  context,
}) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve("dist/lantern-ridge.html")).href);
  const status = page.locator("#runtime-status");
  await expect(status).toHaveText("PixiJS accelerated");
  const canvas = page.locator("#game canvas");
  const position: [number, number][] = [
    [0.21, 0.23],
    [0.62, 0.36],
    [0.41, 0.77],
    [0.5, 0.9],
  ];
  const waitForArt = async () =>
    expect
      .poll(async () => (await pixels(canvas, position))[0][0])
      .toBeGreaterThan(32);
  await waitForArt();
  const pixi = await pixels(canvas, position);
  await page.locator("#backend").selectOption("canvas");
  await expect(status).toHaveText("Canvas 2D");
  await waitForArt();
  const canvas2d = await pixels(canvas, position);
  for (let i = 0; i < position.length; i++)
    for (let channel = 0; channel < 3; channel++) {
      expect(
        Math.abs(pixi[i][channel] - canvas2d[i][channel]),
      ).toBeLessThanOrEqual(8);
    }
  const before = await canvas.screenshot();
  await page.keyboard.down("KeyD");
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  await page.keyboard.up("KeyD");
  await page.setViewportSize({ width: 930, height: 640 });
  await expect
    .poll(() => canvas.evaluate((item: HTMLCanvasElement) => item.width))
    .toBe(930);
  await page.locator("#backend").selectOption("pixi");
  await expect(status).toHaveText("PixiJS accelerated");
  await canvas.evaluate((canvas: HTMLCanvasElement) =>
    canvas
      .getContext("webgl2")!
      .getExtension("WEBGL_lose_context")!
      .loseContext(),
  );
  await expect(status).toHaveText("Canvas 2D");
  await expect(page.locator("#runtime-error")).toContainText(
    "Accelerated rendering was lost",
  );
});

test("the exported game recovers without acceleration and reports an invalid texture", async ({
  page,
}, testInfo) => {
  const sample = await readFile(resolve("dist/lantern-ridge.html"), "utf8");
  const broken = sample.replace(
    /data:image\/png;base64,[A-Za-z0-9+/=]+/,
    "data:image/png;base64,AAAA",
  );
  expect(broken).not.toBe(sample);
  const file = testInfo.outputPath("texture-error.html");
  await writeFile(file, broken);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined });
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type === "2d"
          ? Reflect.apply(original, this, [type, ...args])
          : null;
      },
    });
  });
  await page.goto(pathToFileURL(file).href);
  await expect(page.locator("#runtime-status")).toHaveText("Canvas 2D");
  await expect(page.locator("#runtime-error")).toHaveText(
    'Could not decode "Ridge panorama".',
  );
  await expect(page.locator("#game canvas")).toBeVisible();
});

test("a downloaded project can be reopened and exported as a playable browser file", async ({
  page,
}, testInfo) => {
  await editor(page);
  await page.getByRole("button", { name: "UI", exact: true }).click();
  await page.getByRole("button", { name: "Label", exact: true }).click();
  await page.getByLabel("Display text").fill("Find the lantern");
  await page.getByLabel("Display text").press("Enter");
  await page.getByRole("button", { name: "Tilemap", exact: true }).click();
  const box = await page.getByLabel("Tilemap viewport").boundingBox();
  await page.mouse.click(
    box!.x + box!.width * 0.38,
    box!.y + box!.height * 0.6,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = await download;
  const archive = parseProject(await readFile((await saved.path())!, "utf8"));
  expect(archive.scenes[0].tilemap.tiles).toHaveLength(1);
  expect(
    archive.scenes[0].entities.some(
      (e) => e.visual?.kind === "text" && e.visual.text === "Find the lantern",
    ),
  ).toBe(true);
  const chooser = page.waitForEvent("filechooser");
  await fileMenu(page, "Open Project");
  await (
    await chooser
  ).setFiles({
    name: "lantern.mosaic.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await expect(
    page.getByText("Project opened.", { exact: true }),
  ).toBeVisible();
  const extraction = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exported = await extraction;
  const game = testInfo.outputPath("exported.html");
  await exported.saveAs(game);
  const player = await page.context().newPage();
  await player.goto(pathToFileURL(game).href);
  await expect(player.locator("#game-title")).toHaveText("Lantern Ridge");
  await expect(player.locator("#game canvas")).toBeVisible();
});

test("dock panels can be moved, resized, reopened, saved, and reset", async ({
  page,
}) => {
  await editor(page);
  const project = page.locator(".dock-tab").filter({ hasText: /^Project$/ });
  const inspector = page
    .locator(".dock-tab")
    .filter({ hasText: /^Inspector$/ });
  const preview = page
    .locator(".dock-tab")
    .filter({ hasText: /^Game Preview$/ });
  const parentGroup = (panel: Locator) =>
    panel.locator("xpath=ancestor::*[contains(@class,'dv-groupview')][1]");
  const locate = (panel: Locator) => parentGroup(panel).boundingBox();
  const initialProject = (await locate(project))!;
  const initialInspector = (await locate(inspector))!;
  const initialPreview = (await locate(preview))!;
  const sash = page.locator(".dv-sash").filter({ visible: true });
  const target = (await sash.all()).map(async (candidate) => ({
    box: await candidate.boundingBox(),
    candidate,
  }));
  const vertical = (await Promise.all(target)).find(
    ({ box }) =>
      box &&
      box.width < 12 &&
      Math.abs(box.x - initialProject.width - initialProject.x) < 10,
  );
  expect(vertical).toBeTruthy();
  const splitter = vertical!.box!;
  await page.mouse.move(
    splitter.x + splitter.width / 2,
    splitter.y + splitter.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    splitter.x + splitter.width / 2 + 43,
    splitter.y + splitter.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await locate(project))!.width)
    .toBeGreaterThan(initialProject.width + 16);
  async function dockWith(from: Locator, name: string) {
    await from.click({ button: "right" });
    await page.getByText(`Dock with ${name}`, { exact: true }).click();
  }
  await dockWith(inspector, "Project");
  await expect
    .poll(async () => (await locate(inspector))!.x)
    .toBeLessThan(initialInspector.x);
  await dockWith(preview, "Inspector");
  await expect
    .poll(async () => (await locate(preview))!.x)
    .toBeLessThan(initialPreview.x);
  await page
    .locator("details.menu > summary")
    .getByText("Window", { exact: true })
    .click();
  await page.getByLabel("Layout name").fill("Testing");
  await page.getByRole("button", { name: "Save named layout" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Game Preview/ }).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole("menuitemcheckbox", { name: /Game Preview/ }).click();
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "Testing", exact: true }).click();
  await page.reload();
  await expect
    .poll(async () => (await locate(inspector))!.x)
    .toBeLessThan(initialInspector.x);
  await expect
    .poll(async () => (await locate(preview))!.x)
    .toBeLessThan(initialPreview.x);
  await page
    .locator("details.menu > summary")
    .getByText("Window", { exact: true })
    .click();
  await page.getByRole("button", { name: "Reset Layout" }).click();
  await expect
    .poll(async () => (await locate(inspector))!.x)
    .toBeCloseTo(initialInspector.x, 0);
});

test("right-clicking a panel can collapse it into the sidebar", async ({
  page,
}) => {
  await editor(page);
  await page
    .locator(".dock-tab")
    .filter({ hasText: /^Inspector$/ })
    .click({ button: "right" });
  await page.getByText("Collapse to Sidebar", { exact: true }).click();
  const sidebar = page
    .locator(".dv-edge-group")
    .getByRole("tab", { name: "Inspector", exact: true });
  await expect(sidebar).toBeVisible();
  await sidebar.click();
  await expect(page.getByLabel("Blueprint name")).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(".dv-edge-collapsed")
      .getByRole("tab", { name: "Inspector", exact: true }),
  ).toBeVisible();
});

test("authors a function and timed event loop, steps through it, and exports the visible result", async ({
  page,
  context,
}, testInfo) => {
  await editor(page);
  const inspector = page.locator(".inspector");
  const canvas = page.locator(".blueprint-canvas");
  const root = canvas.getByLabel("Add block", { exact: true });
  const entry = canvas.getByLabel("Blueprint event");
  const card = (label: string) =>
    canvas
      .locator(".logic-card")
      .filter({
        has: page.getByRole("button", { name: label, exact: true }),
      })
      .last();
  async function setExpression(label: string, source: string) {
    const button = canvas.getByRole("button", {
      name: "Edit " + label,
      exact: true,
    });
    await button.click();
    const editor = button.locator("..");
    await editor.getByText("Enter expression", { exact: true }).click();
    const input = editor.getByLabel(label + " expression", { exact: true });
    await input.fill(source);
    await input.press("Enter");
    await expect(editor.getByRole("alert")).toHaveCount(0);
    await button.click();
  }
  await inspector
    .getByRole("button", { name: "Function", exact: true })
    .click();
  await inspector.getByLabel("Function name").fill("Increase");
  await inspector.getByLabel("Function name").press("Enter");
  await inspector.getByLabel("Return type").selectOption("number");
  await inspector
    .getByRole("button", { name: "Parameter", exact: true })
    .click();
  await inspector.getByLabel("Parameter name").fill("amount");
  await inspector.getByLabel("Parameter name").press("Enter");
  await root.selectOption("return");
  await setExpression("Return value", "amount + 10");
  await expect(
    canvas.getByRole("button", { name: "Edit Return value" }),
  ).toContainText("amount");

  await inspector.getByText("Scene Events", { exact: true }).click();
  await inspector
    .getByRole("button", { name: "Scene Event", exact: true })
    .click();
  const eventName = inspector.getByLabel("Scene event name").last();
  await eventName.fill("Title Ready");
  await eventName.press("Enter");
  await inspector
    .getByLabel("Event payload type")
    .last()
    .selectOption("boolean");
  await inspector
    .getByLabel("Add event handler")
    .selectOption({ label: "Title Ready" });
  await root.selectOption("property");
  await card("Set Property").getByLabel("Target mode").selectOption("entity");
  await setExpression("Target entity", 'entity("title")');
  await setExpression("Property value", "payload");

  await entry.selectOption({ label: "On Start" });
  await root.selectOption("repeat");
  await card("Repeat").getByLabel("Add block to body").selectOption("call");
  await card("Call Function")
    .getByLabel("Function result variable")
    .selectOption({ label: "speed" });
  await setExpression("Argument amount", "2");
  await card("Repeat").getByLabel("Add block to body").selectOption("wait");
  await root.selectOption("emit");
  await card("Emit Event")
    .getByLabel("Event to emit")
    .selectOption({ label: "Title Ready" });
  await setExpression("Event payload", "false");
  await expect(page.getByText("✓ Valid", { exact: true })).toBeVisible();

  await card("Call Function")
    .locator(":scope > header")
    .getByRole("button", { name: "Set breakpoint" })
    .click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("blueprint-pause")).toContainText("On Start");
  await expect(card("Call Function")).toHaveClass(/debug-paused/);
  await page.getByRole("button", { name: "Step Block", exact: true }).click();
  await expect(page.getByTestId("blueprint-pause")).toContainText("Increase");
  await expect(card("Return")).toHaveClass(/debug-paused/);
  await expect(
    page.getByRole("row").filter({ hasText: "amount" }),
  ).toContainText("2");
  await entry.selectOption({ label: "On Start" });
  await card("Call Function")
    .locator(":scope > header")
    .getByRole("button", { name: "Remove breakpoint" })
    .click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "speed" }),
  ).toContainText("12");

  const projectDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = parseProject(
    await readFile((await (await projectDownload).path())!, "utf8"),
  );
  expect(
    saved.signals?.find((signal) => signal.name === "Title Ready"),
  ).toMatchObject({
    name: "Title Ready",
    type: "boolean",
  });
  expect(saved.blueprints[0]).toMatchObject({
    version: 2,
    functions: [
      {
        name: "Increase",
        returns: "number",
        parameters: [{ name: "amount", type: "number" }],
      },
    ],
  });
  const gameDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const output = testInfo.outputPath("title-ready.html");
  await (await gameDownload).saveAs(output);

  await context.setOffline(true);
  const player = await context.newPage();
  await player.goto(pathToFileURL(output).href);
  await expect(player.locator("#game-title")).toHaveText("Lantern Ridge");
  await player.locator("#backend").selectOption("canvas");
  await expect(player.locator("#runtime-status")).toHaveText("Canvas 2D");
  const image = player.locator("#game canvas");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((canvas: HTMLCanvasElement) => {
        const scale = Math.min(canvas.width / 640, canvas.height / 360);
        const left = (canvas.width - 640 * scale) / 2;
        const top = (canvas.height - 360 * scale) / 2;
        const ctx = canvas.getContext("2d")!;
        const scan = (y: number, height: number) => {
          const pixels = ctx.getImageData(
            left + 20 * scale,
            top + y * scale,
            260 * scale,
            height * scale,
          ).data;
          return pixels.some(
            (red, offset) =>
              offset % 4 === 0 &&
              red > 220 &&
              pixels[offset + 1] > 175 &&
              pixels[offset + 2] > 100,
          );
        };
        return { title: scan(20, 30), controls: scan(52, 20) };
      }),
    )
    .toEqual({ title: false, controls: true });
  await player.close();
});
