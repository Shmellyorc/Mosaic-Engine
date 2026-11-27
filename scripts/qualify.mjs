import { build } from "esbuild";
import { root } from "./bundles.mjs";

const result = await build({
  absWorkingDir: root,
  entryPoints: ["scripts/qualification.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  write: false,
});
await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
);
