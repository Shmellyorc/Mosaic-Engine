import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseProject } from "@mosaic/model";

test("authors, previews and saves a scene route in its own document", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    localStorage.setItem("mosaic-renderer", "canvas");
  });
  await page.goto("http://127.0.0.1:5188/");
  const project = page.getByRole("tabpanel", { name: "Project" });
  await project.getByRole("button", { name: "New scene", exact: true }).click();
  await project
    .getByRole("button", { name: "Ridge Workshop", exact: true })
    .click();
  await project
    .getByRole("button", { name: "Project.sceneflow", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Project.sceneflow" }),
  ).toHaveAttribute("aria-selected", "true");
  const graph = page.locator(".flow-board");
  await graph
    .getByRole("button", { name: "Ridge Workshop", exact: true })
    .click();
  await page.getByRole("button", { name: "Route", exact: true }).click();
  await page.getByLabel("Route target").selectOption({ label: "New Scene" });
  await page.getByLabel("Route name", { exact: true }).fill("Stream preview");
  await page.getByLabel("Route name", { exact: true }).press("Enter");
  await page.getByLabel("Route operation").selectOption("add");
  await page.getByLabel("Scene offset X").fill("160");
  await page.getByLabel("Scene offset X").press("Enter");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(graph.getByText("Active: Ridge Workshop")).toBeVisible();
  await page.getByRole("button", { name: "Run route", exact: true }).click();
  const destination = await page
    .getByLabel("Route target")
    .locator("option:checked")
    .innerText();
  await expect(
    graph
      .getByRole("button", { name: new RegExp(destination) })
      .locator('[aria-label="Loaded"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = parseProject(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(data.sceneFlow?.routes).toEqual([
    expect.objectContaining({
      name: "Stream preview",
      operation: "add",
      offset: { x: 160, y: 0 },
    }),
  ]);
});
