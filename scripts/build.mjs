import { build as vite } from "vite";
import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildGame, pngInline, root } from "./bundles.mjs";

const { version } = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const dist = resolve(root, "dist");
const desktop = resolve(dist, "desktop");
await mkdir(desktop, { recursive: true });
const bundle = await buildGame();
const sample = await build({
  absWorkingDir: root,
  stdin: {
    contents:
      'export { exampleProject, workshopProject, signalLabProject, tradingPostProject, lanternWatchProject, playableExamples } from "@mosaic/example"; export { gameHtml } from "./apps/game/src/html.ts"; export { serializeProject } from "@mosaic/model";',
    resolveDir: root,
  },
  format: "esm",
  platform: "node",
  target: "node24",
  bundle: true,
  write: false,
  plugins: [pngInline],
});
const {
  exampleProject,
  workshopProject,
  signalLabProject,
  tradingPostProject,
  lanternWatchProject,
  playableExamples,
  gameHtml,
  serializeProject,
} = await import(
  `data:text/javascript;base64,${Buffer.from(sample.outputFiles[0].contents).toString("base64")}`
);
await Promise.all([
  vite({ configFile: resolve(root, "apps/editor/vite.config.ts") }),
  ...["main", "preload"].map((name) =>
    build({
      absWorkingDir: root,
      entryPoints: [`apps/desktop/src/${name}.ts`],
      outfile: resolve(desktop, `${name}.cjs`),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node24",
      external: ["electron"],
      minify: true,
      legalComments: "inline",
    }),
  ),
  writeFile(resolve(desktop, "game.js"), bundle),
  writeFile(
    resolve(dist, "lantern-ridge.html"),
    gameHtml(exampleProject(), bundle),
  ),
  writeFile(
    resolve(dist, "ridge-workshop.html"),
    gameHtml(workshopProject(), bundle),
  ),
  writeFile(
    resolve(dist, "lantern-signal-lab.html"),
    gameHtml(signalLabProject(), bundle),
  ),
  writeFile(
    resolve(dist, "ridge-trading-post.html"),
    gameHtml(tradingPostProject(), bundle),
  ),
  writeFile(
    resolve(dist, "lantern-watch.html"),
    gameHtml(lanternWatchProject(), bundle),
  ),
  ...playableExamples.flatMap(({ id, create }) => {
    const project = create();
    return [
      writeFile(resolve(dist, id + ".html"), gameHtml(project, bundle)),
      writeFile(resolve(dist, id + ".mosaic.json"), serializeProject(project)),
    ];
  }),
  copyFile(resolve(root, "LICENSE"), resolve(desktop, "LICENSE")),
  writeFile(
    resolve(desktop, "package.json"),
    JSON.stringify({
      name: "mosaic-engine",
      productName: "Mosaic Engine",
      version,
      main: "main.cjs",
      license: "MIT",
    }),
  ),
]);
