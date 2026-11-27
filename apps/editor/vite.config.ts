import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { buildGame } from "../../scripts/bundles.mjs";

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [
    react(),
    {
      name: "mosaic-standalone-runtime",
      resolveId(id) {
        if (id === "virtual:mosaic-game") return "\0" + id;
      },
      async load(id) {
        if (id === "\0virtual:mosaic-game")
          return `export default ${JSON.stringify(await buildGame())}`;
      },
    },
    {
      name: "mosaic-desktop-csp",
      transformIndexHtml() {
        if (command === "build")
          return [
            {
              tag: "meta",
              injectTo: "head-prepend",
              attrs: {
                "http-equiv": "Content-Security-Policy",
                content:
                  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:",
              },
            },
          ];
      },
    },
  ],
  build: {
    target: "es2023",
    outDir: fileURLToPath(
      new URL("../../dist/desktop/editor", import.meta.url),
    ),
    emptyOutDir: true,
    // Electron loads local files. A single static entry avoids file:// cross-origin module imports.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
}));
