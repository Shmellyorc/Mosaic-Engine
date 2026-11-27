import { useState } from "react";
import { ChevronDown, Code2, Plus, X } from "lucide-react";
import { type Blueprint } from "@mosaic/blueprints";
import {
  applyPrefabRevision,
  capturePrefab,
  createEmitter,
  MAX_EMITTERS,
  entityComponents,
  instantiatePrefab,
  newId,
  prefabDefaults,
  prefabOverrides,
  publishPrefabOverrides,
  resetPrefabProperties,
  type Entity,
  type Scene,
} from "@mosaic/model";
import { ValueControl } from "./blueprint-values";
import { Field, NumberField, Section } from "./controls";
import {
  editEntity,
  editScene,
  chooseEntity,
  selectedScene,
  useEditor,
} from "./state";
import { LightingControls, NavigationControls, PhysicsControls } from "./world";

function perform(run: () => void) {
  try {
    run();
  } catch (error) {
    useEditor
      .getState()
      .report(error instanceof Error ? error.message : String(error), "error");
  }
}
export function EntityPrefabActions({
  entity,
  scene,
}: {
  entity: Entity;
  scene: Scene;
}) {
  const prefab = useEditor((state) =>
    state.project.prefabs?.find(({ id }) => id === entity.prefab?.assetId),
  );
  const defaults = prefab && prefabDefaults(scene, prefab, entity);
  const overrides = defaults ? prefabOverrides(entity, defaults) : [];
  const [reset, setReset] = useState("");
  const key = overrides.find((field) => field === reset) ?? overrides[0];
  return (
    <Section title="Prefab">
      {prefab && defaults ? (
        <>
          <p className="muted">
            {prefab.name} · {overrides.length} overridden properties
          </p>
          <Field label="Override">
            <select
              aria-label="Prefab override"
              disabled={!key}
              value={key ?? ""}
              onChange={(event) => setReset(event.target.value)}
            >
              {!key && <option value="">None</option>}
              {overrides.map((field) => (
                <option key={field}>{field}</option>
              ))}
            </select>
          </Field>
          <div className="inline-actions">
            <button
              disabled={!key}
              onClick={() =>
                editEntity(
                  (draft) =>
                    key && resetPrefabProperties(draft, defaults, [key]),
                )
              }
            >
              Reset override
            </button>
            <button
              disabled={!key}
              onClick={() =>
                perform(() => {
                  if (!key) return;
                  const revision = publishPrefabOverrides(
                    prefab,
                    scene,
                    entity,
                    [key],
                  );
                  useEditor.getState().edit((project) => {
                    applyPrefabRevision(project.scenes, prefab, revision);
                    const list = project.prefabs!;
                    list[list.findIndex(({ id }) => id === prefab.id)] =
                      revision;
                  });
                })
              }
            >
              Apply to prefab
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() =>
            perform(() => {
              const prefab = capturePrefab(scene, entity.id);
              useEditor.getState().edit((project) => {
                if ((project.prefabs?.length ?? 0) >= 512)
                  throw Error("The project has reached the prefab limit.");
                (project.prefabs ??= []).push(prefab);
              });
              useEditor.getState().report("Prefab created.");
            })
          }
        >
          Save as prefab
        </button>
      )}
    </Section>
  );
}

export function insertPrefab(id: string) {
  perform(() => {
    const state = useEditor.getState();
    const scene = selectedScene(state);
    const prefab = state.project.prefabs?.find((item) => item.id === id);
    if (!prefab) return;
    const group = instantiatePrefab(prefab, scene, {
      x: scene.camera.x,
      y: scene.camera.y,
    });
    editScene((draft) => {
      draft.entities.push(...group);
    });
    chooseEntity(group.find(({ parentId }) => !parentId));
    useEditor.setState({ workspace: "Scene" });
  });
}

export function BlueprintAttachments({
  entity,
  blueprints,
}: {
  entity: Entity;
  blueprints: Blueprint[];
}) {
  const definitions = new Map(blueprints.map((item) => [item.id, item]));
  const [choice, setChoice] = useState("");
  const selected = definitions.has(choice) ? choice : (blueprints[0]?.id ?? "");
  return (
    <div className="attachment-list">
      {entity.attachments?.map((attachment) => {
        const definition = definitions.get(attachment.blueprintId);
        const missing = definition?.requires?.filter(
          (key) =>
            !entityComponents
              .find((component) => component.key === key)
              ?.present(entity),
        );
        const update = (recipe: (draft: typeof attachment) => void) =>
          editEntity((draft) => {
            const target = draft.attachments?.find(
              ({ id }) => id === attachment.id,
            );
            if (target) recipe(target);
          });
        return (
          <details className="attachment-card" key={attachment.id} open>
            <summary>
              <ChevronDown size={13} />{" "}
              {definition?.name ?? "Missing Blueprint"}
            </summary>
            <Field label="Enabled">
              <input
                type="checkbox"
                aria-label="Enable attachment"
                checked={attachment.enabled}
                onChange={(event) =>
                  update((draft) => {
                    draft.enabled = event.target.checked;
                  })
                }
              />
            </Field>
            {missing?.length ? (
              <p className="muted">
                Requires{" "}
                {missing
                  .map(
                    (key) =>
                      entityComponents.find((item) => item.key === key)?.name,
                  )
                  .join(", ")}
                .
              </p>
            ) : null}
            {definition?.variables
              .filter(({ exposed }) => exposed)
              .map((variable) => {
                const overrides = attachment.overrides;
                const enabled =
                  !!overrides && Object.hasOwn(overrides, variable.id);
                return (
                  <div className="attachment-variable" key={variable.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={"Override " + variable.name}
                        checked={enabled}
                        onChange={(event) =>
                          update((draft) => {
                            if (event.target.checked)
                              (draft.overrides ??= {})[variable.id] =
                                structuredClone(variable.initial);
                            else if (draft.overrides)
                              delete draft.overrides[variable.id];
                          })
                        }
                      />{" "}
                      {variable.name}
                    </label>
                    {enabled && (
                      <ValueControl
                        label={variable.name + " override"}
                        value={overrides![variable.id]}
                        change={(value) =>
                          update((draft) => {
                            (draft.overrides ??= {})[variable.id] = value;
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            <div className="inline-actions">
              <button
                disabled={!definition}
                onClick={() =>
                  useEditor.setState({
                    blueprintId: attachment.blueprintId,
                    attachmentId: attachment.id,
                    workspace: "Blueprints",
                    selectedTile: null,
                    eventId: null,
                  })
                }
              >
                <Code2 size={14} /> Edit
              </button>
              <button
                aria-label={"Remove attachment " + (definition?.name ?? "")}
                onClick={() =>
                  editEntity((draft) => {
                    draft.attachments = draft.attachments?.filter(
                      ({ id }) => id !== attachment.id,
                    );
                  })
                }
              >
                <X size={14} /> Remove
              </button>
            </div>
          </details>
        );
      })}
      <div className="inline-actions">
        <select
          aria-label="Blueprint to attach"
          value={selected}
          onChange={(event) => setChoice(event.target.value)}
        >
          {!blueprints.length && (
            <option value="">Create a Blueprint first</option>
          )}
          {blueprints.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          disabled={!selected || (entity.attachments?.length ?? 0) >= 32}
          onClick={() =>
            editEntity((draft) => {
              (draft.attachments ??= []).push({
                id: newId(),
                blueprintId: selected,
                enabled: true,
              });
            })
          }
        >
          <Plus size={14} /> Attach
        </button>
      </div>
    </div>
  );
}

export function ComponentInspector({
  entity,
  scene,
}: {
  entity: Entity;
  scene: Scene;
}) {
  const sounds = useEditor((state) => state.project.mixer?.sounds);
  const occupied = new Set(
    scene.entities
      .filter(({ id }) => id !== entity.id)
      .flatMap((entry) => entry.tileLayers ?? []),
  );
  return (
    <>
      <Section title="Components">
        <PhysicsControls scene={scene} entity={entity} embedded />
        <NavigationControls scene={scene} entity={entity} embedded />
        <LightingControls scene={scene} entity={entity} embedded />
      </Section>
      <Section title="Particle component">
        {entity.particles ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={entity.particles.enabled}
                aria-label="Emit on start"
                onChange={(event) =>
                  editEntity((draft) => {
                    draft.particles!.enabled = event.target.checked;
                  })
                }
              />{" "}
              Emit on start
            </label>
            <Field label="Rate">
              <NumberField
                label="Entity particle rate"
                value={entity.particles.rate}
                min={0}
                max={500}
                onChange={(value) =>
                  editEntity((draft) => {
                    draft.particles!.rate = value;
                  })
                }
              />
            </Field>
            <button
              onClick={() => useEditor.setState({ workspace: "Particles" })}
            >
              Edit particle emitter
            </button>
            <button
              onClick={() =>
                editEntity((draft) => {
                  delete draft.particles;
                })
              }
            >
              Remove emitter
            </button>
          </>
        ) : (
          <button
            disabled={
              scene.entities.filter(({ particles }) => particles).length >=
              MAX_EMITTERS
            }
            onClick={() =>
              editEntity((draft) => {
                draft.particles = createEmitter();
              })
            }
          >
            Add particle emitter
          </button>
        )}
      </Section>
      <Section title="Camera component">
        {entity.camera ? (
          <>
            <label>
              <input
                type="checkbox"
                aria-label="Enable camera component"
                checked={entity.camera.enabled}
                onChange={(event) =>
                  editEntity((draft) => {
                    draft.camera!.enabled = event.target.checked;
                  })
                }
              />{" "}
              Active camera
            </label>
            <Field label="Zoom">
              <NumberField
                label="Entity camera zoom"
                value={entity.camera.zoom}
                min={0.05}
                max={8}
                step={0.05}
                onChange={(value) =>
                  editEntity((draft) => {
                    draft.camera!.zoom = value;
                  })
                }
              />
            </Field>
            <Field label="Damping">
              <NumberField
                label="Entity camera damping"
                value={entity.camera.damping ?? 0}
                min={0}
                max={60}
                onChange={(value) =>
                  editEntity((draft) => {
                    draft.camera!.damping = value;
                  })
                }
              />
            </Field>
            <button
              onClick={() =>
                editEntity((draft) => {
                  delete draft.camera;
                })
              }
            >
              Remove Camera
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              editEntity((draft) => {
                draft.camera = { enabled: true, zoom: 1 };
              })
            }
          >
            Add Camera
          </button>
        )}
      </Section>
      <Section title="Tile layers component">
        {scene.tilemap.layers?.map((layer) => (
          <label key={layer.id} className="component-choice">
            <input
              type="checkbox"
              disabled={occupied.has(layer.id)}
              checked={entity.tileLayers?.includes(layer.id) ?? false}
              aria-label={"Own tile layer " + layer.name}
              onChange={(event) =>
                editEntity((draft) => {
                  draft.tileLayers = event.target.checked
                    ? [...(draft.tileLayers ?? []), layer.id]
                    : draft.tileLayers?.filter((id) => id !== layer.id);
                })
              }
            />
            {layer.name}
          </label>
        ))}
        {!scene.tilemap.layers?.length && (
          <span className="muted">
            Add a layer in Tilemap to assign it here.
          </span>
        )}
      </Section>
      <Section title="Audio source component">
        <Field label="Sound">
          <select
            aria-label="Entity audio source"
            value={entity.audio?.soundId ?? ""}
            onChange={(event) =>
              editEntity((draft) => {
                const soundId = event.target.value;
                if (!soundId) delete draft.audio;
                else
                  draft.audio = {
                    soundId,
                    autoplay: draft.audio?.autoplay ?? false,
                  };
              })
            }
          >
            <option value="">None</option>
            {sounds?.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        {entity.audio && (
          <label>
            <input
              type="checkbox"
              checked={entity.audio.autoplay}
              onChange={(event) =>
                editEntity((draft) => {
                  draft.audio!.autoplay = event.target.checked;
                })
              }
            />{" "}
            Play on start
          </label>
        )}
      </Section>
      <EntityPrefabActions entity={entity} scene={scene} />
    </>
  );
}
