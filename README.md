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
- **Blueprints** edits typed expressions, nested branches and loops, reusable functions, and scene events. Add blocks from the stack or the Block Library, and drag a block header or press Alt+Up/Down to reorder. Validation identifies the affected block.
- **Tilemap**, **Animator**, **UI**, and **Input** provide separate central workspaces for painting grid tiles, editing and previewing spritesheet clips, placing HUD labels, and binding keyboard axes.
- **Window** reopens panels, saves named layouts, and resets docking. Drag panel tabs to group or split them, and drag the sash to resize. Right-click a panel tab for docking and sidebar controls.
- **Play** creates a fresh runtime copy of the scene. Click **Game Preview** to give it keyboard focus. Pause holds the runtime, Restart creates a new instance, and Stop returns to authoring.

Open **File → Open Lantern Ridge Sample** for a self-contained example. Move the lantern keeper with A/D or the arrow keys. The project demonstrates camera follow, a spritesheet with idle and walking clips, and a screen-space HUD. The Lookout Lamp demonstrates a timed loop, a typed scene event, and a reusable function. Sample art is original to this repository and covered by the LICENSE.

## Blueprint execution

- Use **Functions** in the Inspector to define parameters and a return type. **Call Function** passes typed arguments and can store the result in a variable. **Declare Local** scopes a value to the rest of its stack and its nested blocks. Entity variables retain one value per runtime entity.
- Define a payload type under **Scene Events**, add an event handler, and emit the event from any blueprint in the scene. A handler can read its `payload` variable. **Wait** suspends its stack for simulation time while other stacks continue. Update handlers finish their current invocation before starting another.
- Select an expression chip for typed controls or open **Enter expression** to use a JavaScript-style expression such as `amount * 2 + Math.abs(offset)`. The parser resolves names to stable IDs and accepts an allowlisted set of operations. Expressions support numbers, Booleans, text, vectors, entity and asset references, enum values, and typed record fields.
- Click a tile’s breakpoint indicator or press **F9** on its header. **Step Block** in Debug executes one block and shows the current call stack and locals. Continue with **Resume** or the top-bar Play button. Blueprint edits during play recompile affected behaviours, keep compatible entity variables, and restart their update handlers on the next simulation tick. Use Restart to rerun On Start handlers.
- Blueprint format 2 preserves functions, events and typed expression data. Format 1 blueprints still open and run. The exported player executes the same compiled logic with editor breakpoints disabled.

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
