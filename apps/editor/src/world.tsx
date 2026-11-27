import { Camera, Grid2X2, MapPin, Plus, Sun, Waves } from "lucide-react";
import {
  createAgent,
  createBody,
  createLight,
  newId,
  type Body,
  type Entity,
  type Scene,
  type Terrain,
  type TileLayer,
} from "@mosaic/model";
import { entityCenter } from "@mosaic/runtime";
import { Field, NumberField, Section, TextField } from "./controls";
import {
  chooseEntity,
  editEntity,
  editScene,
  selectedEntity,
  selectedScene,
  useEditor,
} from "./state";

export const worldTools = {
  Tilemap: Grid2X2,
  Physics: Waves,
  Cameras: Camera,
  Navigation: MapPin,
  Lighting: Sun,
} as const;
export type WorldTool = keyof typeof worldTools;

function Numeric({
  label,
  value,
  change,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  change: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <NumberField
        label={label}
        value={value}
        onChange={change}
        min={min}
        max={max}
        step={step}
      />
    </Field>
  );
}
function Flag({
  label,
  value,
  change,
}: {
  label: string;
  value: boolean;
  change: (value: boolean) => void;
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        type="checkbox"
        checked={value}
        onChange={(event) => change(event.target.checked)}
      />
    </Field>
  );
}
function Color({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        type="color"
        value={value}
        onChange={(event) => change(event.target.value)}
      />
    </Field>
  );
}
function Choice({
  label,
  value,
  change,
  values,
  empty,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  values: readonly { id: string; name: string }[];
  empty?: string;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => change(event.target.value)}
      >
        {empty && <option value="">{empty}</option>}
        {values.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function resizeMap(
  scene: Scene,
  axis: "width" | "height" | "size",
  value: number,
) {
  const map = scene.tilemap;
  map[axis] = value;
  const inside = (tile: { x: number; y: number }) =>
    tile.x < map.width && tile.y < map.height;
  map.tiles = map.tiles.filter(inside);
  for (const layer of map.layers ?? [])
    layer.tiles = layer.tiles.filter(inside);
}

export function WorldInspector({ tool }: { tool: WorldTool }) {
  const scene = useEditor(selectedScene);
  const entity = useEditor(selectedEntity);
  const Icon = worldTools[tool];
  return (
    <div className="panel-body inspector world-inspector">
      <div className="inspector-title">
        <div className="object-icon purple">
          <Icon size={20} />
        </div>
        <div>
          <strong>{tool}</strong>
          <small>{scene.name}</small>
        </div>
      </div>
      {tool === "Tilemap" && <TilemapControls scene={scene} />}
      {tool === "Physics" && <PhysicsControls scene={scene} entity={entity} />}
      {tool === "Cameras" && <CameraControls scene={scene} />}
      {tool === "Navigation" && (
        <NavigationControls scene={scene} entity={entity} />
      )}
      {tool === "Lighting" && (
        <LightingControls scene={scene} entity={entity} />
      )}
    </div>
  );
}

function TilemapControls({ scene }: { scene: Scene }) {
  const activeTileLayer = useEditor((state) => state.activeTileLayer);
  const activeTerrain = useEditor((state) => state.activeTerrain);
  const assets = useEditor((state) => state.project.assets);
  const { tilemap } = scene;
  const layer = tilemap.layers?.find((item) => item.id === activeTileLayer);
  const terrain = tilemap.terrains?.find((item) => item.id === activeTerrain);
  function editLayer(update: (draft: TileLayer) => void) {
    editScene((draft) => {
      const target = draft.tilemap.layers?.find(
        (item) => item.id === layer?.id,
      );
      if (target) update(target);
    });
  }
  function editTerrain(update: (draft: Terrain) => void) {
    editScene((draft) => {
      const target = draft.tilemap.terrains?.find(
        (item) => item.id === terrain?.id,
      );
      if (target) update(target);
    });
  }
  function addLayer() {
    const id = newId();
    editScene((draft) => {
      const layers = (draft.tilemap.layers ??= []);
      layers.push({
        id,
        name: "Tile layer " + (layers.length + 1),
        layerId: draft.layers[1]?.id ?? draft.layers[0].id,
        tiles: [],
        visible: true,
        collision: true,
        navigation: true,
        opacity: 1,
      });
    });
    useEditor.setState({ activeTileLayer: id });
  }
  function addTerrain() {
    const id = newId();
    editScene((draft) => {
      const terrains = (draft.tilemap.terrains ??= []);
      terrains.push({
        id,
        name: "Terrain " + (terrains.length + 1),
        color: "#82a478",
        edge: "#b4d494",
        cost: 1,
        solid: false,
      });
    });
    useEditor.setState({ activeTerrain: id });
  }
  return (
    <>
      <Section title="Grid">
        <Numeric
          label="Columns"
          value={tilemap.width}
          min={1}
          max={256}
          change={(value) =>
            editScene((draft) => resizeMap(draft, "width", value))
          }
        />
        <Numeric
          label="Rows"
          value={tilemap.height}
          min={1}
          max={256}
          change={(value) =>
            editScene((draft) => resizeMap(draft, "height", value))
          }
        />
        <Numeric
          label="Cell size"
          value={tilemap.size}
          min={4}
          max={128}
          change={(value) =>
            editScene((draft) => resizeMap(draft, "size", value))
          }
        />
      </Section>
      <Section title="Paint Layer">
        <Choice
          label="Tile layer"
          value={layer?.id ?? ""}
          empty="Base layer"
          values={tilemap.layers ?? []}
          change={(id) => useEditor.setState({ activeTileLayer: id || null })}
        />
        <button
          onClick={addLayer}
          disabled={(tilemap.layers?.length ?? 0) >= 32}
        >
          <Plus size={14} /> Add Tile Layer
        </button>
        {layer && (
          <>
            <Field label="Name">
              <TextField
                label="Tile layer name"
                value={layer.name}
                onChange={(name) =>
                  editLayer((draft) => {
                    draft.name = name;
                  })
                }
              />
            </Field>
            <Choice
              label="Render layer"
              value={layer.layerId}
              values={scene.layers}
              change={(id) =>
                editLayer((draft) => {
                  draft.layerId = id;
                })
              }
            />
            <Flag
              label="Show tile layer"
              value={layer.visible}
              change={(value) =>
                editLayer((draft) => {
                  draft.visible = value;
                })
              }
            />
            <Flag
              label="Enable tile collisions"
              value={layer.collision}
              change={(value) =>
                editLayer((draft) => {
                  draft.collision = value;
                })
              }
            />
            <Flag
              label="Apply navigation cost"
              value={layer.navigation}
              change={(value) =>
                editLayer((draft) => {
                  draft.navigation = value;
                })
              }
            />
            <Numeric
              label="Tile opacity"
              value={layer.opacity}
              min={0}
              max={1}
              step={0.05}
              change={(value) =>
                editLayer((draft) => {
                  draft.opacity = value;
                })
              }
            />
            <div className="inline-actions">
              {([-1, 1] as const).map((delta) => {
                const at = tilemap.layers!.findIndex(
                  (item) => item.id === layer.id,
                );
                return (
                  <button
                    key={delta}
                    disabled={
                      at + delta < 0 || at + delta >= tilemap.layers!.length
                    }
                    onClick={() =>
                      editScene((draft) => {
                        const layers = draft.tilemap.layers!;
                        [layers[at], layers[at + delta]] = [
                          layers[at + delta],
                          layers[at],
                        ];
                      })
                    }
                  >
                    {delta < 0 ? "Move Layer Up" : "Move Layer Down"}
                  </button>
                );
              })}
            </div>
            <button
              className="danger"
              onClick={() =>
                editScene((draft) => {
                  draft.tilemap.layers = draft.tilemap.layers?.filter(
                    (item) => item.id !== layer.id,
                  );
                })
              }
            >
              Remove Tile Layer
            </button>
          </>
        )}
      </Section>
      <Section title="Terrain and Autotile">
        <Choice
          label="Terrain brush"
          value={terrain?.id ?? ""}
          empty="Flat color"
          values={tilemap.terrains ?? []}
          change={(id) => useEditor.setState({ activeTerrain: id || null })}
        />
        <button
          onClick={addTerrain}
          disabled={(tilemap.terrains?.length ?? 0) >= 128}
        >
          <Plus size={14} /> Add Terrain
        </button>
        {terrain && (
          <>
            <Field label="Name">
              <TextField
                label="Terrain name"
                value={terrain.name}
                onChange={(name) =>
                  editTerrain((draft) => {
                    draft.name = name;
                  })
                }
              />
            </Field>
            <Color
              label="Terrain fill"
              value={terrain.color}
              change={(color) =>
                editTerrain((draft) => {
                  draft.color = color;
                })
              }
            />
            <Color
              label="Terrain edge"
              value={terrain.edge}
              change={(color) =>
                editTerrain((draft) => {
                  draft.edge = color;
                })
              }
            />
            <Flag
              label="Solid terrain"
              value={terrain.solid}
              change={(value) =>
                editTerrain((draft) => {
                  draft.solid = value;
                })
              }
            />
            <Numeric
              label="Traversal cost"
              value={terrain.cost}
              min={1}
              max={100}
              step={0.25}
              change={(value) =>
                editTerrain((draft) => {
                  draft.cost = value;
                })
              }
            />
            <Choice
              label="Autotile image"
              value={terrain.atlas?.assetId ?? ""}
              empty="Procedural edges"
              values={assets}
              change={(id) =>
                editTerrain((draft) => {
                  draft.atlas = id
                    ? { assetId: id, size: 16, columns: 4, first: 0 }
                    : undefined;
                })
              }
            />
            {terrain.atlas && (
              <>
                <Numeric
                  label="Atlas tile size"
                  value={terrain.atlas.size}
                  min={1}
                  max={8192}
                  change={(value) =>
                    editTerrain((draft) => {
                      draft.atlas!.size = value;
                    })
                  }
                />
                <Numeric
                  label="Atlas columns"
                  value={terrain.atlas.columns}
                  min={1}
                  max={64}
                  change={(value) =>
                    editTerrain((draft) => {
                      draft.atlas!.columns = value;
                    })
                  }
                />
                <Numeric
                  label="First atlas tile"
                  value={terrain.atlas.first}
                  min={0}
                  max={4096}
                  change={(value) =>
                    editTerrain((draft) => {
                      draft.atlas!.first = value;
                    })
                  }
                />
                <small>
                  16 consecutive frames. North 1, east 2, south 4, west 8.
                </small>
              </>
            )}
            <button
              className="danger"
              onClick={() =>
                editScene((draft) => {
                  const map = draft.tilemap;
                  map.terrains = map.terrains?.filter(
                    (item) => item.id !== terrain.id,
                  );
                  for (const tiles of [
                    map.tiles,
                    ...(map.layers ?? []).map((item) => item.tiles),
                  ])
                    for (const tile of tiles) {
                      if (tile.terrainId !== terrain.id) continue;
                      tile.terrainId = undefined;
                      tile.color = terrain.color;
                      tile.solid ??= terrain.solid;
                      tile.cost ??= terrain.cost;
                    }
                })
              }
            >
              Remove Terrain
            </button>
          </>
        )}
      </Section>
    </>
  );
}

function SelectEntity({ scene, entity }: { scene: Scene; entity?: Entity }) {
  return (
    <Choice
      label="World entity"
      value={entity?.id ?? ""}
      values={scene.entities}
      empty="Choose an entity"
      change={(id) =>
        chooseEntity(scene.entities.find((item) => item.id === id))
      }
    />
  );
}

function PhysicsControls({ scene, entity }: { scene: Scene; entity?: Entity }) {
  const signals = useEditor((state) => state.project.signals);
  const gravity = scene.gravity ?? { x: 0, y: 0 };
  const body = entity?.body;
  const controls = [
    ["width", "Body width", 1, 8192, 1],
    ["height", "Body height", 1, 8192, 1],
    ["offsetX", "Offset X", -1e7, 1e7, 0.1],
    ["offsetY", "Offset Y", -1e7, 1e7, 0.1],
    ["velocityX", "Initial velocity X", -10000, 10000, 0.1],
    ["velocityY", "Initial velocity Y", -10000, 10000, 0.1],
    ["gravityScale", "Gravity multiplier", -8, 8, 0.1],
    ["bounce", "Bounce", 0, 1, 0.05],
  ] as const;
  return (
    <>
      <Section title="Scene Gravity">
        {(["x", "y"] as const).map((axis) => (
          <Numeric
            key={axis}
            label={"Gravity " + axis.toUpperCase()}
            value={gravity[axis]}
            min={-10000}
            max={10000}
            change={(value) =>
              editScene((draft) => {
                (draft.gravity ??= { x: 0, y: 0 })[axis] = value;
              })
            }
          />
        ))}
      </Section>
      <Section title="Body">
        <SelectEntity scene={scene} entity={entity} />
        {entity?.parentId && (
          <small>Physics bodies belong to root entities.</small>
        )}
        {entity && !body && (
          <button
            disabled={!!entity.parentId}
            onClick={() =>
              editEntity((draft) => {
                draft.body = createBody(
                  draft.transform.width,
                  draft.transform.height,
                );
              })
            }
          >
            <Plus size={14} /> Add Body
          </button>
        )}
        {body && (
          <>
            <Choice
              label="Body type"
              value={body.kind}
              values={["static", "kinematic", "dynamic", "sensor"].map(
                (kind) => ({
                  id: kind,
                  name: kind[0].toUpperCase() + kind.slice(1),
                }),
              )}
              change={(kind) =>
                editEntity((draft) => {
                  draft.body!.kind = kind as Body["kind"];
                })
              }
            />
            {controls.map(([key, label, min, max, step]) => (
              <Numeric
                key={key}
                label={label}
                value={body[key]}
                min={min}
                max={max}
                step={step}
                change={(value) =>
                  editEntity((draft) => {
                    draft.body![key] = value;
                  })
                }
              />
            ))}
            {(["enterSignal", "exitSignal"] as const).map((key) => (
              <Choice
                key={key}
                label={
                  key === "enterSignal"
                    ? "Contact enter event"
                    : "Contact exit event"
                }
                value={body[key] ?? ""}
                values={(signals ?? []).filter(
                  (item) => item.type === "entity" || item.type === "void",
                )}
                empty="None"
                change={(id) =>
                  editEntity((draft) => {
                    draft.body![key] = id || null;
                  })
                }
              />
            ))}
            <button
              className="danger"
              onClick={() =>
                editEntity((draft) => {
                  draft.body = undefined;
                })
              }
            >
              Remove Body
            </button>
          </>
        )}
      </Section>
    </>
  );
}

function CameraControls({ scene }: { scene: Scene }) {
  const project = useEditor((state) => state.project);
  const { camera } = scene;
  const fields = [
    ["x", "Center X", -1e7, 1e7],
    ["y", "Center Y", -1e7, 1e7],
    ["zoom", "Camera zoom", 0.05, 8],
    ["offsetX", "Follow offset X", -1e7, 1e7],
    ["offsetY", "Follow offset Y", -1e7, 1e7],
    ["damping", "Follow damping", 0, 60],
  ] as const;
  return (
    <>
      <Section title="Framing">
        <Choice
          label="Follow entity"
          value={camera.follow ?? ""}
          empty="Fixed camera"
          values={scene.entities}
          change={(id) =>
            editScene((draft) => {
              draft.camera.follow = id || null;
            })
          }
        />
        {fields.map(([key, label, min, max]) => (
          <Numeric
            key={key}
            label={label}
            min={min}
            max={max}
            step={0.05}
            value={camera[key] ?? 0}
            change={(value) =>
              editScene((draft) => {
                draft.camera[key] = value;
              })
            }
          />
        ))}
      </Section>
      <Section title="Dead Zone">
        {(["width", "height"] as const).map((key) => (
          <Numeric
            label={"Dead zone " + key}
            key={key}
            value={camera.deadZone?.[key] ?? 0}
            min={0}
            max={8192}
            change={(value) =>
              editScene((draft) => {
                (draft.camera.deadZone ??= { width: 0, height: 0 })[key] =
                  value;
              })
            }
          />
        ))}
      </Section>
      <Section title="World Bounds">
        <Flag
          label="Clamp camera to bounds"
          value={!!camera.bounds}
          change={(enabled) =>
            editScene((draft) => {
              draft.camera.bounds = enabled
                ? { x: 0, y: 0, width: project.width, height: project.height }
                : undefined;
            })
          }
        />
        {camera.bounds &&
          (["x", "y", "width", "height"] as const).map((key) => (
            <Numeric
              key={key}
              label={"Bounds " + key}
              min={key === "x" || key === "y" ? -1e7 : 1}
              max={key === "x" || key === "y" ? 1e7 : 8192}
              value={camera.bounds![key]}
              change={(value) =>
                editScene((draft) => {
                  draft.camera.bounds![key] = value;
                })
              }
            />
          ))}
      </Section>
    </>
  );
}

function NavigationControls({
  scene,
  entity,
}: {
  scene: Scene;
  entity?: Entity;
}) {
  const agent = entity?.navigation;
  const invalid = !!entity?.parentId || entity?.body?.kind === "static";
  return (
    <Section title="Pathfinding Agent">
      <SelectEntity scene={scene} entity={entity} />
      {invalid && <small>Use a non-static root entity.</small>}
      {entity && !agent && (
        <button
          disabled={invalid}
          onClick={() =>
            editEntity((draft) => {
              draft.body ??= createBody(
                Math.min(scene.tilemap.size, draft.transform.width),
                Math.min(scene.tilemap.size, draft.transform.height),
              );
              const position = entityCenter(draft);
              draft.navigation = createAgent(position.x, position.y);
            })
          }
        >
          <Plus size={14} /> Add Navigation Agent
        </button>
      )}
      {agent && (
        <>
          <Flag
            label="Run navigation in play mode"
            value={agent.enabled}
            change={(value) =>
              editEntity((draft) => {
                draft.navigation!.enabled = value;
              })
            }
          />
          <Choice
            label="Destination mode"
            value={agent.target ?? ""}
            empty="World position"
            values={scene.entities.filter((item) => item.id !== entity?.id)}
            change={(id) =>
              editEntity((draft) => {
                draft.navigation!.target = id || null;
              })
            }
          />
          {(["x", "y"] as const).map((key) => (
            <Numeric
              key={key}
              label={"Destination " + key.toUpperCase()}
              value={agent[key]}
              step={0.1}
              change={(value) =>
                editEntity((draft) => {
                  draft.navigation![key] = value;
                  draft.navigation!.target = null;
                })
              }
            />
          ))}
          <Numeric
            label="Agent speed"
            value={agent.speed}
            min={1}
            max={1000}
            change={(value) =>
              editEntity((draft) => {
                draft.navigation!.speed = value;
              })
            }
          />
          <small>
            Tile traversal costs and solid collision layers shape the route.
          </small>
          <button
            className="danger"
            onClick={() =>
              editEntity((draft) => {
                draft.navigation = undefined;
              })
            }
          >
            Remove Navigation Agent
          </button>
        </>
      )}
    </Section>
  );
}

function LightingControls({
  scene,
  entity,
}: {
  scene: Scene;
  entity?: Entity;
}) {
  const lighting = scene.lighting ?? { ambient: "#53596d", enabled: false };
  const light = entity?.light;
  return (
    <>
      <Section title="Environment">
        <Flag
          label="Enable scene lighting"
          value={lighting.enabled}
          change={(value) =>
            editScene((draft) => {
              (draft.lighting ??= lighting).enabled = value;
            })
          }
        />
        <Color
          label="Ambient light"
          value={lighting.ambient}
          change={(value) =>
            editScene((draft) => {
              (draft.lighting ??= lighting).ambient = value;
            })
          }
        />
      </Section>
      <Section title="Point Light">
        <SelectEntity scene={scene} entity={entity} />
        {entity && !light && (
          <button
            disabled={scene.entities.filter((item) => item.light).length >= 128}
            onClick={() =>
              editEntity((draft, scene) => {
                draft.light = createLight();
                (scene.lighting ??= {
                  ambient: "#53596d",
                  enabled: true,
                }).enabled = true;
              })
            }
          >
            <Plus size={14} /> Add Point Light
          </button>
        )}
        {light && (
          <>
            <Flag
              label="Enable point light"
              value={light.enabled}
              change={(value) =>
                editEntity((draft) => {
                  draft.light!.enabled = value;
                })
              }
            />
            <Color
              label="Light tint"
              value={light.color}
              change={(value) =>
                editEntity((draft) => {
                  draft.light!.color = value;
                })
              }
            />
            <Numeric
              label="Light radius"
              value={light.radius}
              min={1}
              max={8192}
              change={(value) =>
                editEntity((draft) => {
                  draft.light!.radius = value;
                })
              }
            />
            <Numeric
              label="Light intensity"
              value={light.intensity}
              min={0}
              max={1}
              step={0.05}
              change={(value) =>
                editEntity((draft) => {
                  draft.light!.intensity = value;
                })
              }
            />
            <button
              className="danger"
              onClick={() =>
                editEntity((draft) => {
                  draft.light = undefined;
                })
              }
            >
              Remove Point Light
            </button>
          </>
        )}
      </Section>
    </>
  );
}
