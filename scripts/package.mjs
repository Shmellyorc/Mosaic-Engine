import { packager } from "@electron/packager";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { root } from "./bundles.mjs";

const require = createRequire(import.meta.url);
const { version } = require("electron/package.json");
const paths = await packager({
  dir: resolve(root, "dist/desktop"),
  out: resolve(root, "dist/packages"),
  electronVersion: version,
  executableName: "mosaic-engine",
  name: "Mosaic Engine",
  asar: true,
  overwrite: true,
});
console.log(paths.join("\n"));
