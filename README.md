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
- **Tilemap**, **Physics**, **Cameras**, **Navigation**, and **Lighting** provide scene tools with editable controls and viewport previews.
- **Animator**, **Timeline**, **Particles**, and **Audio** provide dedicated authoring and preview workspaces for gameplay effects.
- **Data** opens tools for typed sheets, enums, structs, resources, globals, saves, and localization.
- **UI** designs responsive game interfaces with a docked hierarchy and inspector. **Input** binds keyboard axes.
- Click an image in **Project** to open its document preview. Assign it to the selected entity with the explicit assignment button, or choose it as an autotile atlas in the Tilemap inspector. **Validate project assets** checks image decoding and dimensions, sprite and animation frame bounds, terrain atlases, UI references, and embedded WAV files.
- **Window** reopens panels, saves named layouts, and resets docking. Drag panel tabs to group or split them, and drag the sash to resize. Right-click a panel tab for docking and sidebar controls.
- **Play** creates a fresh runtime copy of the scene. Click **Game Preview** to give it keyboard focus. Pause holds the runtime, Restart creates a new instance, and Stop returns to authoring. Authoring changes apply between simulation frames. Unchanged authored fields retain their live values, and explicitly edited fields take on the new authored values. Adding an entity with a Blueprint runs its On Start handler.

Open **File → Open Lantern Ridge Sample** for a self-contained example. Move the lantern keeper with A/D or the arrow keys. The project demonstrates camera follow, a spritesheet with idle and walking clips, and a screen-space HUD. The Lookout Lamp demonstrates a timed loop, a typed scene event, and a reusable function. Sample art is original to this repository and covered by the LICENSE.

## Play the example games

Open a playable example from the **File** menu, then press **Play** and use the Game Preview. Each game is an editable Mosaic project with its rules in the Blueprint editor.

- **Lantern Courier** is a timed delivery through an alternating route. Move with WASD or the arrow keys, collect stamps 1, 2, and 3 in order, and reach the green gate before time runs out. The patrols can end a run early. The game saves the fastest successful delivery in the Personal Best slot.
- **Beacon Circuit** is a three-board logic puzzle. Click a beacon or navigate with the arrow keys and press Enter. Each switch flips itself and its orthogonal neighbors. Light all nine beacons to advance. Reset board restores the current pattern and keeps the running move count. The game saves the fewest moves for a full clear.

- **Relay Isles** is a three-stop relay puzzle. Read the tide chart, choose the correct relay at each port, and restore the network.
- **Tideglass** challenges you to balance three station gauges. Open adds two units, Vent removes one, and Seal checks the gauge against its target.

The build writes a standalone HTML file and an editable `.mosaic.json` document for each title. Each HTML player offers both renderers and an **Enable audio** control. CI publishes all four pairs in the **playable-example-games** artifact.

## Open and arrange project documents

The **Project** browser opens scenes, entities, Blueprints, prefabs, images, tilemaps, animators, timelines, particle systems, UI, audio clips, data and input in filename tabs. **Editors** provides shortcuts to tools for the selected scene or entity. Document tabs and the selected editor return with the browser workspace autosave.

The scene and UI editors have their own hierarchies. Blueprint documents have a local Block Library. Drag the divider to resize these tools, or use the arrow keys while the divider is focused. Collapse and width preferences persist. **Window** manages shared dockable tools, including Project, Inspector, Game Preview, Audio Mixer, Debug, Console and Profiler. The Audio Mixer opens independently of the selected document.

## Build entity hierarchies and prefabs

Drag an entity onto a parent in **Hierarchy**, or drop it onto the scene to make it a root. Reparenting keeps the authored local transform. Physics and navigation agents use root entities. The **Inspector** controls visual, physics, navigation, lighting, particles, camera, tile-layer ownership, audio, and behavior components.

Use **Save as prefab** on a selected entity to capture its hierarchy. Select the prefab in **Project** and choose **Instantiate prefab** to insert a linked copy. Changes to inherited properties can be published from an instance with **Apply to prefab**. Other instances receive the revised defaults where their properties still match the previous definition. Use **Reset override** to restore an individual property. Blueprint references to entities inside the prefab resolve to members of the current instance.

Under **Behaviour**, retain a primary Blueprint and attach additional instances. Every attachment has independent variables and can be enabled or disabled. Expose variables in the Blueprint inspector to override their defaults per attachment. Declared component dependencies are checked before the attachment runs. Editing a Blueprint preserves compatible live variables in each instance. Adding or enabling an attachment starts that instance.

Projects using these additions save as format 2. The editor and runtime continue to read older format 1 projects and interpret single Blueprint assignments as primary attachments. Renderer-independent component storage uses generational runtime handles and cached component queries. Saved documents continue to reference entities and assets by stable IDs.

## Connect scenes

Open `Project.sceneflow` to arrange scene nodes and define directed routes. Routes can be called by a Blueprint or triggered by a typed event. Change selects a primary scene, Add streams another scene into the running world, Unload removes an additive scene, Reload restarts a scene's local state, and Preload prepares its authored entities for activation. Routes can fade across transitions. Additive scenes keep their own tile grids and can sit at a pixel offset in the shared physics and render world.

A persistent entity carries its whole root hierarchy across transitions. Its live transform, handle and Blueprint state are retained. Project globals are shared across scenes. Each scene's own UI and ordinary entities initialize when activated.

## Blueprint execution

- Use **Functions** in the Inspector to define parameters and a return type. **Call Function** passes typed arguments and can store the result in a variable. **Declare Local** scopes a value to the rest of its stack and its nested blocks. Entity variables retain one value per runtime entity.
- Define a payload type under **Scene Events**, add an event handler, and emit the event from any blueprint in the scene. A handler can read its `payload` variable. **Wait** suspends its stack for simulation time while other stacks continue. Update handlers finish their current invocation before starting another.
- Select an expression chip for typed controls or open **Enter expression** to use a JavaScript-style expression such as `amount * 2 + Math.abs(offset)`. The parser resolves names to stable IDs and accepts an allowlisted set of operations. Expressions support numbers, Booleans, text, vectors, entity and asset references, enum values, and typed record fields.
- Click a tile’s breakpoint indicator or press **F9** on its header. **Step Block** in Debug executes one block and shows the current call stack and locals. Continue with **Resume** or the top-bar Play button. Blueprint edits during play recompile affected behaviours, keep compatible entity variables, and restart their update handlers on the next simulation tick. Use Restart to rerun On Start handlers.
- Blueprint format 2 preserves functions, events and typed expression data. Format 1 blueprints still open and run. The exported player executes the same compiled logic with editor breakpoints disabled.

Use the categorized **Block Library** to find typed getters, setters and system actions. Drag a getter into a compatible value slot or use **Insert getter** with the keyboard. Drop actions into event, function and branch stacks, or use the block menu to move an existing block. [Blueprint runtime coverage](docs/blueprint-runtime.md)

## Build reusable behavior trees

Create a `.behavior` asset in Project, then assign it to a scene entity or prefab member. The editor presents ordered sequences and selectors as nested tiles. Conditions read typed blackboard keys or literals. Actions can wait, write a key, or call a Blueprint function with typed inputs and optional results. Decorators invert or force success, repeat, time out, or enforce a cooldown. Play mode shows node outcomes and per-entity blackboard values.

## Author a world

- **Tilemap** paints solid colors or terrain on independent layers mapped to scene render layers. Terrain can connect with generated edges or a 16-frame atlas. Atlas frames are ordered by the sum of the matching neighbor flags, with 1 for north, 2 for east, 4 for south, and 8 for west. Layer controls set visibility, opacity, collision participation, and traversal cost. Tile data is indexed on demand in 16 × 16 cell chunks, with up to 32 resident indexes per tile layer.
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

Open a `.synth` document to design a procedural sound. The Sound Designer provides six oscillators, a waveform preview, an ADSR envelope, pitch sweep, vibrato, low-pass filtering, echo, presets and seeded variations. The Music Tracker uses editable `.tracker` songs with instruments, up to 16 tracks, note effects, reusable patterns and arrangements. Both play through the shared mixer, can be triggered by Blueprint, and export PCM WAV files.

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

Open `Project.uiflow` to arrange reusable `.ui` screens on ordered layers. Screens may start with the project or with a specific scene. Modal screens can trap focus, block lower input, and pause simulation while Blueprint UI events remain active. Pointer pass-through, show, hide, push, pop, replace, move and theme switching are configurable in UI Flow and Blueprint. UI assets draw after the world in both renderers. Screen authors can assign inherited themes, five control states, nine-slice imagery, typography and widget-level overrides.

## Profile a running scene

Open **Window → Profiler** or select the Profiler tab beside Debug. Play the scene with **Game Preview** open. The panel samples frame intervals, simulation CPU time, draw-list generation, and renderer submission. It shows the latest values, 95th percentiles, draw commands, spatial candidates, resident tile chunks, decoded texture usage, and live reload timing. **Download capture** saves the latest 180 samples and counters as JSON. Use **Clear capture** before reproducing a slow interaction.

World sprites and rectangles use a spatial grid to select camera-visible draws. Each render surface decodes visible textures on demand with up to four concurrent decodes, 96 resident images, and a 256 MiB decoded-pixel budget. Decoded images can be evicted as the camera moves. The asset audit checks embedded images and sounds across the whole project, including unused assets.

## Extend Blueprint expressions

Open **Window → Extensions** and import a JSON manifest like this one.

```json
{
  "version": 1,
  "id": "ridge.math",
  "name": "Ridge Math",
  "functions": [
    {
      "id": "double",
      "name": "Double",
      "parameters": [{ "id": "amount", "type": "number" }],
      "result": "number",
      "body": "amount * 2"
    }
  ]
}
```

Choose **Extension function** in a Blueprint expression and connect typed argument expressions. A manifest defines scalar functions over their parameters using the Blueprint expression parser's arithmetic, comparison, Boolean, string, and numeric operators. Supported types are `number`, `boolean`, and `string`. Function bodies have no access to the scene, input, or project data. Projects store the declarations and references by ID, so the same functions run in preview and offline exports. Re-import a manifest with the same ID to update it.

## Rendering and export

The same runtime feeds the PixiJS accelerated backend and the independent Canvas 2D renderer. **Auto Renderer** tries acceleration and switches to Canvas 2D if initialization fails or the rendering context is lost. Choose a backend explicitly from the toolbar. Canvas 2D is the compatibility API and can use hardware acceleration depending on the browser.

**Export** writes one offline HTML file with the starting scene, runtime code, embedded images and WAV sounds, the project data catalog, and the authored game interfaces. Open that file in a browser to play. The export runs without React or Electron.

A Mosaic project folder contains a versioned `project.mosaic.json` file. The file embeds images and sounds and preserves entity IDs, hierarchy, scene settings, input axes, Animator definitions, effects, authored data, Blueprints, and extension declarations. Gameplay save files are separate from project files.

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
| `packages/example`    | Lantern Ridge, complete example games, and shared art and audio                |

```sh
npm run typecheck
npm run lint
npm test
npm run qualify
npm run build
npm run release:package
npx playwright install chromium
npm run smoke
```

The build writes the editor to `dist/desktop/` and the offline samples to `dist/lantern-ridge.html`, `dist/ridge-workshop.html`, `dist/lantern-signal-lab.html`, `dist/ridge-trading-post.html`, and `dist/lantern-watch.html`. The playable examples also ship offline HTML and editable project files for Lantern Courier, Beacon Circuit, Relay Isles, and Tideglass. Packaging creates an executable app bundle for the current platform in `dist/packages/`. Run `npm run release:archive` after packaging to create a `tar.gz`, SHA-256 checksum, and JSON manifest in `dist/`. The release archives are for development and testing. Public installers and macOS notarization require distribution credentials.

Browser and packaged desktop smoke tests require a graphical session. On Linux, use `xvfb-run --auto-servernum npm run smoke`. CI runs the browser suite, including PixiJS and Canvas 2D parity, and launches the packaged editor on Linux x64, Windows x64, and macOS arm64. Each native job checks project creation, asset import, save and reopen, and offline HTML export. Download the native archives, checksums, manifests, and sample HTML files from a successful run. [Build and test workflow](https://github.com/Shmellyorc/Mosaic-Engine/actions/workflows/ci.yml)

**Performance qualification** builds a repeatable large-world fixture with 16,000 scenery entities, 128 moving bodies, 64 particle emitters, and 32,768 tiles. It measures project parse time, the first draw list, 240 simulation and draw-list samples, and post-GC heap growth. It checks the legacy draw digest, spatial candidates, tile residency, frame time, and heap growth. A second fixture repeatedly preloads, adds, and unloads a region with 384 Behavior Tree instances. It checks that unloaded handles are invalidated and persistent state remains live. The command writes `dist/qualification.json`, which CI uploads as **performance-qualification**.

MIT licensed.
