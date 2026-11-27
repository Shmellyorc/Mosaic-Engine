import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseProject } from "@mosaic/model";

test("authors a reusable screen, duplicates an unassigned image and previews it in an ordered layer", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", "canvas");
  });
  await page.goto("http://127.0.0.1:5188/");
  const project = page.getByRole("tabpanel", { name: "Project" });
  await project
    .getByRole("button", { name: "New UI screen", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "New Screen.ui" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator(".ui-add-menu summary").click();
  await page.getByRole("button", { name: "Add Image", exact: true }).click();
  const hierarchy = page.getByRole("complementary", { name: "UI Hierarchy" });
  await hierarchy
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect(
    hierarchy.getByRole("button", { name: "Image Copy", exact: true }),
  ).toBeVisible();
  await project
    .getByRole("button", { name: "Project.uiflow", exact: true })
    .click();
  await page.getByRole("button", { name: "New Screen", exact: true }).click();
  await page.getByLabel("Screen layer").selectOption("overlay");
  await page.getByLabel("Screen lifetime").selectOption("global");
  await page.getByLabel("Show at Project start").check();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.locator(".ui-flow-screen").getByLabel("Visible"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = parseProject(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(data.uiFlow?.screens[0]).toMatchObject({
    layerId: "overlay",
    lifetime: "global",
  });
  expect(
    data.uiFlow?.screens[0].document.widgets.map((widget) => [
      widget.kind,
      widget.image,
    ]),
  ).toEqual([
    ["image", undefined],
    ["image", undefined],
  ]);
});
