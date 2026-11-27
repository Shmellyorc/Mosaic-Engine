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
- **Tilemap**, **Physics**, **Cameras**, **Navigation**, and **Lighting** provide dedicated world workspaces with editable controls and viewport previews.
- **Animator**, **Timeline**, **Particles**, and **Audio** provide dedicated authoring and preview workspaces for gameplay effects.
- **Data** opens tools for typed sheets, enums, structs, resources, globals, saves, and localization.
- **UI** designs responsive game interfaces with a docked hierarchy and inspector. **Input** binds keyboard axes.
- Click an image in the **Project** tree to open its **Assets** preview. Assign it to the selected entity with the explicit assignment button, or choose it as an autotile atlas in the Tilemap inspector.
- **Window** reopens panels, saves named layouts, and resets docking. Drag panel tabs to group or split them, and drag the sash to resize. Right-click a panel tab for docking and sidebar controls.
- **Play** creates a fresh runtime copy of the scene. Click **Game Preview** to give it keyboard focus. Pause holds the runtime, Restart creates a new instance, and Stop returns to authoring.

Open **File → Open Lantern Ridge Sample** for a self-contained example. Move the lantern keeper with A/D or the arrow keys. The project demonstrates camera follow, a spritesheet with idle and walking clips, and a screen-space HUD. The Lookout Lamp demonstrates a timed loop, a typed scene event, and a reusable function. Sample art is original to this repository and covered by the LICENSE.

## Blueprint execution

- Use **Functions** in the Inspector to define parameters and a return type. **Call Function** passes typed arguments and can store the result in a variable. **Declare Local** scopes a value to the rest of its stack and its nested blocks. Entity variables retain one value per runtime entity.
- Define a payload type under **Scene Events**, add an event handler, and emit the event from any blueprint in the scene. A handler can read its `payload` variable. **Wait** suspends its stack for simulation time while other stacks continue. Update handlers finish their current invocation before starting another.
- Select an expression chip for typed controls or open **Enter expression** to use a JavaScript-style expression such as `amount * 2 + Math.abs(offset)`. The parser resolves names to stable IDs and accepts an allowlisted set of operations. Expressions support numbers, Booleans, text, vectors, entity and asset references, enum values, and typed record fields.
- Click a tile’s breakpoint indicator or press **F9** on its header. **Step Block** in Debug executes one block and shows the current call stack and locals. Continue with **Resume** or the top-bar Play button. Blueprint edits during play recompile affected behaviours, keep compatible entity variables, and restart their update handlers on the next simulation tick. Use Restart to rerun On Start handlers.
- Blueprint format 2 preserves functions, events and typed expression data. Format 1 blueprints still open and run. The exported player executes the same compiled logic with editor breakpoints disabled.

## Author a world

- **Tilemap** paints solid colors or terrain on independent layers mapped to scene render layers. Terrain can connect with generated edges or a 16-frame atlas. Atlas frames are ordered by the sum of the matching neighbor flags: north 1, east 2, south 4, west 8. Layer controls set visibility, opacity, collision participation, and traversal cost. Tile data is indexed in 16 × 16 cell chunks at runtime.
- **Physics** sets scene gravity and world-aligned box bodies on root entities. Static bodies anchor obstacles, kinematic bodies move under Blueprint commands or assigned velocity, and dynamic bodies also respond to gravity and bounce. Sensor boxes report contact without blocking motion. Attach an entity-typed or payload-free scene event to receive contact enter and exit in the body’s Blueprint. Tile contacts use an empty entity reference.
- **Cameras** edits the scene camera’s center, zoom, follow target and offsets, damping, dead zone, and world bounds. **Preview Game Camera** shows what the exported game will frame.
- **Navigation** previews weighted, four-direction grid paths through tile collisions and static bodies. Add an agent to a root entity and pick a destination cell in the viewport or follow another entity’s cell. Agents follow cell centers. Physical bodies continue to interact with moving obstacles while following their route.
- **Lighting** sets scene ambient color and adds tinted point lights that follow entities. Canvas 2D and PixiJS composite the same falloff map. Screen-space text keeps its original colors.

Choose **Ridge Workshop** from the sample’s scene list and press Play. Move with the arrow keys or WASD, watch the Pathfinder route around the walls, and cross the green pressure pad to trigger the HUD event.

## Animate and mix effects

- **Animator** edits spritesheet frames, playback speed and clip loops. In **State Machine**, assign clips to states, mark an entry state, and order transitions. A transition can listen to a numeric parameter or wait for a non-looping state clip to finish. Preview with temporary parameter values, or use **Set Animation Parameter** to drive the machine from a Blueprint. **Play Animation** still works for direct clip playback.
- **Timeline** records position, rotation, opacity, and scale keys on named entity tracks. Drag the playhead or click a key to preview the scene. Set an easing curve on each key to control its outgoing segment. Enable autoplay or use **Control Timeline** from a Blueprint. **Tween Property** animates the current entity from its live value with the same easing options.
- **Particles** emits seeded bursts or continuous, world-space particles from an entity’s center. Configure emission rate, direction, spread, speed, gravity, lifetime, size, color, and live limits. Use **Control Particles** for bursts and start or stop commands. Both renderers use the same camera-culled draws.
- **Audio** imports embedded 16-bit PCM WAV files up to 8 MiB at 8–96 kHz, mono or stereo. Route sounds to the master output or a separate gain and mute bus. The audition meter measures the preview output. **Control Sound** plays one-shots or loops according to the sound settings and can stop active voices.

Choose **Lantern Signal Lab** from the sample’s scene list. Move with A/D or the arrow keys to see the Animator change state. Press Space to fire the beacon, sweep the charge indicator, and trigger a particle burst and chime. Enable audio in the exported player before sending a signal.

## Author project data

- In **Data → Structs**, define fields and defaults. Use an enum field for registry-backed choices or a text field configured as a sheet relation for a reference to another row. **Sheets** validates unique row keys and keeps related keys in sync when a row is renamed. **Resources** edits a single named record against a struct.
- In a Blueprint value chip, choose **Project data** to read a global, sheet row, resource, translation, active language, or save-slot status. Use **Record field** to select a typed field, and **To text** to display a non-text value. Enum literals can select a registered member.
- **Globals** defines initial values shared by all entities in a running game. **Write Global** updates a writable value. Constants are read-only. Mark individual globals for gameplay saves.
- **Saves** defines named slots and version-to-version migration steps. A slot stores marked globals and the active language. Migrations can rename or drop saved IDs, supply defaults for new values, and retain compatible fields in an updated struct. **Save or Load Game** refers to a named slot. The standalone **Game data** menu also saves and loads slots and imports or downloads portable save files.
- **Localization** defines languages and keyed text. Missing translations fall back through the active language’s parent tags, the default language, then the translation key. Switch the player’s language with **Set Language** or the standalone menu.

Choose **Ridge Trading Post** from the sample’s scene list. Press Space to buy oil, P to save the Trading Ledger, and L to load it. The price, supplier, and trade limit are read from project data. The exported game can switch between English and Spanish and import a previous-version ledger.

## Design a game interface

- In **UI**, add a container, text, image, button, toggle, slider, text input, or progress bar. Select widgets on the canvas or in **Hierarchy**. Drag or nudge widgets in an anchored layout, resize fixed-size widgets from the lower-right corner, and use **Inspector** to edit bounds, margins, colors, borders, focus links, and nested order. Existing screen-space scene labels are available through **Label** and **Scene Labels**.
- Set endpoints and a pivot for anchored widgets. Separated anchor endpoints stretch across the parent with edge insets. Containers can arrange children with horizontal or vertical layouts, spacing, padding, alignment, and grow. The project, wide, and portrait views let you check layout at different aspect ratios.
- Interactive widgets use native button and form semantics. Give controls an accessible name when their visible text is insufficient. Tab follows the hierarchy order, arrow links move between selected controls, and an initial focus target can be set for play.
- **On click** and **On value changed** pick a typed scene event. A button sends no payload, a toggle sends a Boolean, a slider sends a number, and a text input sends a string. Use **Set UI Widget** in a Blueprint to change text, visibility, enabled state, value, or focus.
- Bind widget text and values to project globals, data records, or translations. A compatible interactive control can write its value back to a writable global. The live interface sits above the game canvas in both PixiJS and Canvas 2D and is included in standalone HTML exports.

Choose **Lantern Watch** in the sample project. Open **Controls** to try the bound signal meter, night patrol toggle, call sign field, and language buttons. In the menu, use the arrow keys to move between **Deploy Beacon** and **Controls**.

## Rendering and export

The same runtime feeds the PixiJS accelerated backend and the independent Canvas 2D renderer. **Auto Renderer** tries acceleration and switches to Canvas 2D if initialization fails or the rendering context is lost. Choose a backend explicitly from the toolbar. Canvas 2D is the compatibility API and can use hardware acceleration depending on the browser.

**Export** writes one offline HTML file with the starting scene, runtime code, project data, and embedded images and WAV sounds, the project data catalog, and the authored game interfaces. Open that file in a browser to play. The export runs without React or Electron.

A Mosaic project folder contains a versioned `project.mosaic.json` file. The file embeds images and sounds and preserves entity IDs, hierarchy, scene settings, input axes, Animator definitions, effects, authored data and Blueprint data. Gameplay save files are separate from project files.

## Development and verification

| Path                  | Responsibility                                                                 |
| --------------------- | ------------------------------------------------------------------------------ |
| `apps/desktop`        | Electron lifecycle, sandboxed preload bridge, native dialogs and project I/O   |
| `apps/editor`         | React editor, docking, document history, browser storage and authoring tools   |
| `apps/game`           | Standalone browser player and export document                                  |
| `packages/model`      | Versioned format, validation and serialization                                 |
| `packages/blueprints` | Typed AST, compiler and block diagnostics                                      |
| `packages/runtime`    | Entity state, fixed 60 Hz simulation, motion, effects, audio and draw commands |
| `packages/render`     | PixiJS, Canvas 2D and backend selection                                        |
| `packages/example`    | Lantern Ridge project and assets                                               |

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run package
npx playwright install chromium
npm run smoke
```

The build writes the editor to `dist/desktop/` and the offline samples to `dist/lantern-ridge.html`, `dist/ridge-workshop.html`, `dist/lantern-signal-lab.html`, `dist/ridge-trading-post.html`, and `dist/lantern-watch.html`. Packaging creates an executable app bundle for the current platform in `dist/packages/`. Browser and packaged desktop smoke tests require a graphical session. On Linux CI, run them with `xvfb-run --auto-servernum npm run smoke`. The [Build and test workflow](https://github.com/Shmellyorc/Mosaic-Engine/actions/workflows/ci.yml) publishes a Linux x64 archive and the offline samples as run artifacts.

MIT licensed.
