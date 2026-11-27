import { openEditor } from "./editor-navigation";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { literal } from "@mosaic/blueprints";
import {
  createEntity,
  createProject,
  parseProject,
  serializeProject,
} from "@mosaic/model";

test("authors a prefab tree and Blueprint attachment override through the project round trip", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", "canvas");
  });
  await page.goto("http://127.0.0.1:5188/");
  const project = createProject("Prefab Playground");
  const scene = project.scenes[0];
  const root = createEntity(scene.layers[0].id, "Crate Rig");
  const child = createEntity(scene.layers[0].id, "Marker");
  root.blueprintId = "movement";
  scene.entities.push(root, child);
  project.blueprints.push({
    version: 2,
    id: "movement",
    name: "Drift",
    variables: [
      {
        id: "speed",
        name: "Speed",
        initial: 17,
        type: "number",
        exposed: true,
      },
    ],
    events: [
      {
        id: "start",
        kind: "start",
        blocks: [
          { id: "log", kind: "log", value: { kind: "variable", id: "speed" } },
          {
            id: "shade",
            kind: "property",
            property: "alpha",
            value: literal(0.8),
          },
        ],
      },
    ],
  });
  const fileAction = async (name: string) => {
    await page
      .locator("details.menu > summary")
      .getByText("File", { exact: true })
      .click();
    await page.getByRole("button", { name, exact: true }).click();
  };
  const chooser = page.waitForEvent("filechooser");
  await fileAction("Open Project");
  await (
    await chooser
  ).setFiles({
    name: "prefab.mosaic.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeProject(project)),
  });
  await expect(
    page.getByText("Project opened.", { exact: true }),
  ).toBeVisible();
  await openEditor(page, "Scene");
  const tree = page.getByRole("complementary", {
    name: "Hierarchy",
    exact: true,
  });
  await tree
    .getByRole("button", { name: "Marker", exact: true })
    .dragTo(tree.getByRole("button", { name: "Crate Rig", exact: true }));
  await tree.getByRole("button", { name: "Marker", exact: true }).click();
  await expect(page.getByLabel("Entity parent")).toHaveValue(root.id);
  await tree.getByRole("button", { name: "Crate Rig", exact: true }).click();
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await page.getByLabel("Override Speed").check();
  const override = page.getByLabel("Speed override", { exact: true });
  await override.fill("40");
  await override.press("Enter");
  await page.getByRole("button", { name: "Save as prefab" }).click();
  await page.getByRole("tab", { name: "Project", exact: true }).click();
  await page
    .getByRole("button", { name: "Crate Rig.prefab", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Instantiate prefab", exact: true })
    .click();
  await expect(page.getByLabel("Speed override", { exact: true })).toHaveValue(
    "40",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = parseProject(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(saved.version).toBe(2);
  expect(saved.prefabs?.[0].entities).toHaveLength(2);
  const inserted = saved.scenes[0].entities.filter(({ prefab }) => prefab);
  expect(inserted).toHaveLength(2);
  expect(inserted.find(({ parentId }) => parentId)?.parentId).toBe(
    inserted.find(({ parentId }) => !parentId)?.id,
  );
  expect(
    inserted.find(({ attachments }) => attachments?.length)?.attachments?.[0]
      .overrides,
  ).toEqual({ speed: 40 });
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const gamePath = testInfo.outputPath("prefab-playground.html");
  await (await exported).saveAs(gamePath);
  const game = await page.context().newPage();
  await game.goto(pathToFileURL(gamePath).href);
  await expect(game.locator("#game-title")).toHaveText("Prefab Playground");
  await expect(game.locator("#game canvas")).toBeVisible();
  await game.locator("#backend").selectOption("canvas");
  await expect(game.locator("#runtime-status")).toHaveText("Canvas 2D");
  await game.locator("#backend").selectOption("pixi");
  await expect(game.locator("#runtime-status")).toHaveText(
    "PixiJS accelerated",
  );
  await expect(game.locator("#runtime-error")).toHaveText("");
  await game.close();
});

test("opens filename tabs from one browser and restores local editor tools", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mosaic-renderer", "canvas"),
  );
  await page.goto("http://127.0.0.1:5188/");
  const tabs = page.getByRole("tablist", { name: "Open documents" });
  const project = page.getByRole("tabpanel", { name: "Project" });
  const blueprint = tabs.getByRole("tab", {
    name: "Player Movement.blueprint",
  });
  await expect(blueprint).toHaveAttribute("aria-selected", "true");
  const library = page.getByRole("complementary", { name: "Block Library" });
  await expect(library).toBeVisible();
  const divider = page.getByRole("separator", { name: "Resize Block Library" });
  const oldWidth = Number(await divider.getAttribute("aria-valuenow"));
  await divider.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", String(oldWidth + 12));
  await page.getByRole("button", { name: "Collapse Block Library" }).click();
  await expect(library.getByLabel("Search blocks")).toHaveCount(0);

  await project
    .getByRole("button", { name: "Ridge panorama", exact: true })
    .click();
  const image = tabs.getByRole("tab", { name: "Ridge panorama.png" });
  await expect(image).toHaveAttribute("aria-selected", "true");
  await expect(
    page
      .getByRole("region", { name: "Asset preview" })
      .getByRole("img", { name: "Ridge panorama" }),
  ).toBeVisible();
  await expect(library).toHaveCount(0);
  await project
    .getByRole("button", { name: "Ridge Workshop", exact: true })
    .click();
  await expect(
    tabs.getByRole("tab", { name: "Ridge Workshop.scene" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("complementary", { name: "Hierarchy", exact: true }),
  ).toBeVisible();
  await blueprint.click();
  await expect(
    page.getByRole("button", { name: "Expand Block Library" }),
  ).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open("mosaic-editor", 1);
            open.onsuccess = () => {
              const request = open.result
                .transaction("workspace")
                .objectStore("workspace")
                .get("autosave");
              request.onsuccess = () => {
                const snapshot = request.result;
                resolve(
                  snapshot?.workspace === "Blueprints"
                    ? (snapshot.documents?.length ?? 0)
                    : 0,
                );
                open.result.close();
              };
            };
          }),
      ),
    )
    .toBe(3);
  await page.reload();
  await expect(blueprint).toHaveAttribute("aria-selected", "true");
  await expect(image).toBeVisible();
  await page.getByRole("button", { name: "Expand Block Library" }).click();
  await expect(divider).toHaveAttribute("aria-valuenow", String(oldWidth + 12));
  await tabs.getByRole("button", { name: "Close Ridge panorama.png" }).click();
  await expect(image).toHaveCount(0);
  await openEditor(page, "Audio");
  await expect(
    page.getByRole("tabpanel", { name: "Audio Mixer" }),
  ).toBeVisible();
  await expect(blueprint).toHaveAttribute("aria-selected", "true");
});
