import { expect, test } from "@playwright/test";
import { openEditor } from "./editor-navigation";
import { readFile } from "node:fs/promises";
import { parseProject } from "@mosaic/model";

test("authors a nested Behavior Tree and inspects a running entity", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", "canvas");
  });
  await page.goto("http://127.0.0.1:5188/");
  await openEditor(page, "Behavior Trees");
  await expect(
    page.getByRole("tab", { name: "New Behavior.behavior" }),
  ).toHaveAttribute("aria-selected", "true");
  const library = page.getByRole("complementary", { name: "Node Library" });
  await library.getByRole("button", { name: "Wait", exact: true }).click();
  await page.getByLabel("Wait seconds").fill("3");
  await page.getByLabel("Wait seconds").press("Enter");
  await page.getByRole("button", { name: "Key", exact: true }).click();
  const project = page.getByRole("tabpanel", { name: "Project" });
  await project
    .getByRole("button", { name: "Ridge Workshop", exact: true })
    .click();
  const hierarchy = page.getByRole("complementary", {
    name: "Hierarchy",
    exact: true,
  });
  await hierarchy
    .getByRole("button", { name: "Workshop Keeper", exact: true })
    .click();
  await page
    .getByLabel("Entity Behavior Tree")
    .selectOption({ label: "New Behavior" });
  await page.getByRole("tab", { name: "New Behavior.behavior" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.locator(".tree-tile-wait [data-status=running]"),
  ).toBeVisible();
  await expect(page.getByLabel("Key 1 live")).toHaveValue("false");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = parseProject(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(data.behaviorTrees?.[0].root).toMatchObject({
    kind: "sequence",
    children: [{ kind: "wait", seconds: 3 }],
  });
});
