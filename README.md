# Mosaic Engine

Mosaic Engine is a desktop-first 2D game editor and browser-compatible runtime. Scenes are built from entities, layers, cameras, images, and painted tiles. Typed, nested Blueprint blocks define entity behaviour and compile into executable JavaScript functions with scoped engine APIs.

## Run Mosaic

Install Node.js 24 and use the lockfile for a reproducible build.

```sh
npm ci
npm run desktop
```

For browser-based development, start the Vite preview with `npm run dev`. The desktop application opens and saves project folders through native dialogs. The browser preview uses file pickers where available, with import and download alternatives. Both autosave the current workspace to IndexedDB. Use **File → Save Project** to create a portable project backup.

## Author and play

- **Scene** creates scenes, entities and child entities. Use the dockable Inspector or Scene Settings to adjust components, layer order, camera follow and transforms. Drag visible entities to move them, Alt-drag to pan, and scroll to zoom.
- **Blueprints** edits typed expressions and nested branches for On Start and Update events. Add blocks from the stack or the Block Library, and drag a block header or press Alt+Up/Down to reorder. Validation identifies the affected block. During play, Debug shows execution activity and entity variables.
- **Tilemap**, **Animator**, **UI**, and **Input** provide separate central workspaces for painting grid tiles, editing and previewing spritesheet clips, placing HUD labels, and binding keyboard axes.
- **Window** reopens panels, saves named layouts, and resets docking. Drag panel tabs to group or split them. Drag the sash to resize.
- **Play** creates a fresh runtime copy of the scene. Click **Game Preview** to give it keyboard focus. Pause holds the runtime, Restart creates a new instance, and Stop returns to authoring.

Open **File → Open Lantern Ridge Sample** for a self-contained example. Move the lantern keeper with A/D or the arrow keys. The project demonstrates camera follow, a spritesheet with idle and walking clips, and a screen-space HUD. Sample art is original to this repository and covered by the LICENSE.

## Rendering and export

The same runtime feeds the PixiJS accelerated backend and the independent Canvas 2D renderer. **Auto Renderer** tries acceleration and switches to Canvas 2D if initialization fails or the rendering context is lost. Choose a backend explicitly from the toolbar. Canvas 2D is the compatibility API and can use hardware acceleration depending on the browser.

**Export** writes one offline HTML file with the starting scene, runtime code, project data, and embedded images. Open that file in a browser to play. The export runs without React or Electron.

A Mosaic project folder contains a versioned `project.mosaic.json` file. The file embeds its images and preserves entity IDs, hierarchy, scene settings, input axes, spritesheet clips and Blueprint data.

## Development and verification

| Path                  | Responsibility                                                               |
| --------------------- | ---------------------------------------------------------------------------- |
| `apps/desktop`        | Electron lifecycle, sandboxed preload bridge, native dialogs and project I/O |
| `apps/editor`         | React editor, docking, document history, browser storage and authoring tools |
| `apps/game`           | Standalone browser player and export document                                |
| `packages/model`      | Versioned format, validation and serialization                               |
| `packages/blueprints` | Typed AST, compiler and block diagnostics                                    |
| `packages/runtime`    | Entity state, fixed 60 Hz simulation, input, camera and draw commands        |
| `packages/render`     | PixiJS, Canvas 2D and backend selection                                      |
| `packages/example`    | Lantern Ridge project and assets                                             |

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run package
npx playwright install chromium
npm run smoke
```

The build writes the editor to `dist/desktop/` and the sample game to `dist/lantern-ridge.html`. Packaging creates an executable app bundle for the current platform in `dist/packages/`. Browser and packaged desktop smoke tests require a graphical session. On Linux CI, run them with `xvfb-run --auto-servernum npm run smoke`. The [Build and test workflow](https://github.com/Shmellyorc/Mosaic-Engine/actions/workflows/ci.yml) publishes a Linux x64 archive and the standalone example as run artifacts.

MIT licensed.
