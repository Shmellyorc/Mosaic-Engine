import { _electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseProject } from "@mosaic/model";

test("packaged desktop creates, imports, saves, opens and exports a working project", async ({
  browser,
}) => {
  const work = await mkdtemp(join(tmpdir(), "mosaic-native-"));
  const pkg = resolve(
    "dist/packages",
    `Mosaic Engine-${process.platform}-${process.arch}`,
  );
  const binary =
    process.platform === "darwin"
      ? join(pkg, "Mosaic Engine.app/Contents/MacOS/mosaic-engine")
      : join(
          pkg,
          process.platform === "win32" ? "mosaic-engine.exe" : "mosaic-engine",
        );
  const electron = await _electron.launch({
    executablePath: binary,
    args: [
      `--user-data-dir=${join(work, "profile")}`,
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const projectFolder = join(work, "project");
    const image = resolve("packages/example/assets/lantern.png");
    const exported = join(work, "project.html");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(projectFolder);
    await electron.evaluate(
      ({ dialog }, fixtures) => {
        dialog.showOpenDialog = async (
          windowOrOptions,
          options?: Electron.OpenDialogOptions,
        ) => ({
          canceled: false,
          filePaths: [
            (
              options ?? (windowOrOptions as Electron.OpenDialogOptions)
            ).properties?.includes("openFile")
              ? fixtures.image
              : fixtures.projectFolder,
          ],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: fixtures.exported,
        });
      },
      { image, projectFolder, exported },
    );
    const page = await electron.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Player Movement" }),
    ).toBeVisible();
    const bridge = await page.evaluate(() => ({
      node: typeof (globalThis as Record<string, unknown>).require,
      methods: Object.keys(window.mosaic ?? {}).sort(),
    }));
    expect(bridge).toEqual({
      node: "undefined",
      methods: ["exportGame", "importImage", "openProject", "saveProject"],
    });
    async function fileAction(name: string) {
      await page
        .locator("details.menu > summary")
        .getByText("File", { exact: true })
        .click();
      await page.getByRole("button", { name, exact: true }).click();
    }
    await fileAction("New Project");
    await page.getByLabel("Project name").fill("Native Trail");
    await page
      .getByRole("button", { name: "Create Project", exact: true })
      .click();
    await fileAction("Import Image");
    await expect(
      page.getByText("Image imported.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sprite", exact: true }).click();
    await page.getByLabel("Entity name").fill("Lantern");
    await page.getByLabel("Entity name").press("Enter");
    await page.getByRole("button", { name: "Blueprints", exact: true }).click();
    await page
      .getByRole("button", { name: "New Blueprint", exact: true })
      .click();
    await page.getByLabel("Blueprint name").fill("Walk");
    await page.getByLabel("Blueprint name").press("Enter");
    await page.getByLabel("Add block", { exact: true }).selectOption("if");
    const nested = page
      .locator("article.logic-card")
      .filter({ has: page.getByRole("button", { name: "If", exact: true }) });
    await nested.getByLabel("Add block to then").selectOption("move");
    await nested
      .getByRole("button", { name: "Edit Velocity X", exact: true })
      .click();
    await nested.getByLabel("Velocity X value").fill("45");
    await nested.getByLabel("Velocity X value").press("Enter");
    await page.getByRole("button", { name: "Scene", exact: true }).click();
    await page.getByLabel("Entity blueprint").selectOption({ label: "Walk" });
    await page.getByLabel("Renderer preference").selectOption("canvas");
    await expect(page.getByTestId("scene-backend")).toHaveText("Canvas 2D");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("runtime-position")).not.toHaveText(
      "Position 320.0, 180.0",
    );
    await expect(page.getByTestId("runtime-position")).toContainText(
      "Position ",
    );
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    await expect(
      page.getByText("Project saved.", { exact: true }),
    ).toBeVisible();
    const path = join(projectFolder, "project.mosaic.json");
    const saved = parseProject(await readFile(path, "utf8"));
    expect(saved.name).toBe("Native Trail");
    expect(saved.assets).toHaveLength(1);
    const entity = saved.scenes[0].entities[0];
    expect(entity.name).toBe("Lantern");
    expect(entity.visual).toEqual({
      kind: "sprite",
      assetId: saved.assets[0].id,
    });
    expect(entity.blueprintId).toBe(saved.blueprints[0].id);
    expect(
      saved.blueprints[0].events.find((event) => event.kind === "update")
        ?.blocks[0],
    ).toMatchObject({
      kind: "if",
      then: [{ kind: "move", x: { value: 45 } }],
    });
    await fileAction("Open Project");
    await expect(
      page.getByText("Project opened.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Entity name")).toHaveValue("Lantern");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(
      page.getByText("Standalone game exported.", { exact: true }),
    ).toBeVisible();
    const exportedPage = await browser.newPage();
    await exportedPage.goto(pathToFileURL(exported).href);
    await expect(exportedPage.locator("#game-title")).toHaveText(
      "Native Trail",
    );
    await expect(exportedPage.locator("#game canvas")).toBeVisible();
    await exportedPage.close();
  } finally {
    await electron.close();
    await rm(work, { recursive: true, force: true });
  }
});
