import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const pngInline = {
  name: "inline-png",
  setup(builder) {
    builder.onResolve({ filter: /\.png\?inline$/ }, ({ path, importer }) => ({
      path: resolve(dirname(importer), path.slice(0, -7)),
      namespace: "mosaic-png",
    }));
    builder.onLoad(
      { filter: /.*/, namespace: "mosaic-png" },
      async ({ path }) => ({
        contents: await readFile(path),
        loader: "dataurl",
      }),
    );
  },
};
export async function buildGame() {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["apps/game/src/main.ts"],
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: "es2023",
    write: false,
    legalComments: "inline",
  });
  return result.outputFiles[0].text;
}
