import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inspectWav } from "@mosaic/model";
import { openEditor } from "./editor-navigation";

test("edits and exports a synth preset and a stereo tracker arrangement", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mosaic-renderer", "canvas"),
  );
  await page.goto("http://127.0.0.1:5188/");
  await openEditor(page, "Sound Designer");
  await expect(
    page.getByRole("tab", { name: "New Sound.synth" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Shore Wind", exact: true }).click();
  await expect(page.getByLabel("Waveform", { exact: true })).toHaveValue(
    "noise",
  );
  await page.getByRole("button", { name: "Variation", exact: true }).click();
  await expect(page.getByLabel("Noise seed", { exact: true })).not.toHaveValue(
    "71",
  );
  const mono = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV", exact: true }).click();
  expect(
    inspectWav(await readFile((await (await mono).path())!)).channels,
  ).toBe(1);
  await openEditor(page, "Music Tracker");
  await page.getByRole("button", { name: "Lead row 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Lead row 1", exact: true })
    .press("x");
  await page.getByLabel("Note effect", { exact: true }).selectOption("vibrato");
  await expect(
    page.getByRole("button", { name: "Lead row 1", exact: true }),
  ).toHaveText(/D4.*vibrato/);
  await page
    .getByRole("button", { name: "Append pattern", exact: true })
    .click();
  const stereo = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV", exact: true }).click();
  const wav = inspectWav(await readFile((await (await stereo).path())!));
  expect(wav.channels).toBe(2);
  expect(wav.frames / wav.rate).toBeGreaterThan(4);
});
