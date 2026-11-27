import { newPatch, newTracker } from "./audio-creation";
import { newBehaviorTree } from "./behavior-tree";
import { newUiScreen } from "./ui-flow";
import {
  documentKey,
  sceneFlowDocument,
  uiFlowDocument,
  type DocumentRef,
} from "./documents";
import { auditAssets } from "./asset-audit";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Code2,
  FileImage,
  Folder,
  Layers3,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import {
  createEntity,
  createScene,
  hierarchyIds,
  newId,
  reparentEntity,
  primaryAttachmentId,
  type Entity,
} from "@mosaic/model";
import { resizeMap, WorldInspector } from "./world";
import { BlueprintInspector, revealBlock, symbolName } from "./blueprint";
import { displayValue, typeOf } from "@mosaic/blueprints";
import { Field, NumberField, Section, TextField } from "./controls";
import { BlueprintAttachments, ComponentInspector } from "./entity-components";
import { playGame, stepBlueprint } from "./play";
import {
  chooseEntity,
  chooseScene,
  openDocument,
  editEntity,
  editScene,
  selectedEntity,
  selectedScene,
  useEditor,
} from "./state";

export function addEntity(
  kind: "rect" | "sprite" | "text" = "rect",
  child = false,
) {
  const state = useEditor.getState();
  const scene = selectedScene(state);
  const parent = child ? selectedEntity(state) : undefined;
  const layer =
    kind === "text"
      ? scene.layers.at(-1)!
      : (scene.layers.find((layer) => layer.id === parent?.layerId) ??
        scene.layers[0]);
  const entity = createEntity(
    layer.id,
    kind === "text" ? "Label" : kind === "sprite" ? "Sprite" : "Entity",
  );
  if (kind === "text") {
    entity.visual = {
      kind: "text",
      text: "New Label",
      color: "#ffffff",
      size: 20,
      screen: true,
    };
    Object.assign(entity.transform, { x: 32, y: 32, width: 180, height: 24 });
  } else if (kind === "sprite" && state.project.assets[0]) {
    entity.visual = { kind: "sprite", assetId: state.project.assets[0].id };
  }
  if (parent) {
    entity.parentId = parent.id;
    entity.transform.x = 18;
    entity.transform.y = 18;
  } else if (kind !== "text") {
    entity.transform.x = scene.camera.x;
    entity.transform.y = scene.camera.y;
  }
  entity.order = 1 + Math.max(0, ...scene.entities.map((entry) => entry.order));
  editScene((draft) => {
    draft.entities.push(entity);
  });
  chooseEntity(entity);
}
function removeEntity(id: string) {
  editScene((scene) => {
    const entity = scene.entities.find((item) => item.id === id);
    if (!entity) return;
    scene.entities = scene.entities.filter((item) => item.id !== id);
    for (const child of scene.entities) {
      for (const attachment of child.attachments ?? [])
        for (const value of Object.values(attachment.overrides ?? {})) {
          if (typeof value !== "object") continue;
          if (value.kind === "entity" && value.id === id) value.id = "";
          if (value.kind === "record")
            for (const field of Object.values(value.fields))
              if (
                field &&
                typeof field === "object" &&
                field.kind === "entity" &&
                field.id === id
              )
                field.id = "";
        }
      if (child.parentId === id) child.parentId = entity.parentId;
      if (child.navigation?.target === id) child.navigation.target = null;
    }
    for (const timeline of scene.timelines ?? []) {
      timeline.tracks = timeline.tracks.filter(
        (track) => track.entityId !== id,
      );
    }
    if (scene.camera.follow === id) scene.camera.follow = null;
  });
  useEditor.setState({ entityId: null });
}
function addScene() {
  const scene = createScene("New Scene");
  useEditor.getState().edit((project) => {
    project.scenes.push(scene);
  });
  chooseScene(scene.id);
}
export function ProjectPanel() {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const active = useEditor((state) => state.activeDocument);
  const [query, setQuery] = useState("");
  const [entityPage, setEntityPage] = useState(0);
  const matches = (name: string) =>
    name.toLowerCase().includes(query.toLowerCase());
  const row = (name: string, ref: DocumentRef, Icon = Box) => (
    <button
      key={documentKey(ref)}
      className={`tree-row ${active === documentKey(ref) ? "selected" : ""}`}
      onClick={() => openDocument(ref)}
    >
      <Icon size={15} />
      <span>{name}</span>
    </button>
  );
  const sceneRef = (kind: DocumentRef["kind"], id = scene.id): DocumentRef => ({
    kind,
    id,
    sceneId: scene.id,
  });
  const entities = scene.entities.filter(({ name }) => matches(name));
  const current = Math.min(
    entityPage,
    Math.max(0, Math.ceil(entities.length / 100) - 1),
  );
  return (
    <div className="panel-body project-panel">
      <div className="search">
        <Search size={14} />
        <input
          aria-label="Search project"
          placeholder="Search project…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="tree-root">
        <Box size={17} />
        <strong>{project.name}</strong>
      </div>
      <details open className="tree-group">
        <summary>
          <Folder size={15} /> Scenes{" "}
          <button
            className="icon-button push"
            title="New scene"
            aria-label="New scene"
            onClick={(event) => {
              event.preventDefault();
              addScene();
            }}
          >
            <Plus size={15} />
          </button>
        </summary>
        {matches("Project.sceneflow") &&
          row("Project.sceneflow", sceneFlowDocument, Layers3)}
        {project.scenes
          .filter((item) => matches(item.name))
          .map((item) => (
            <button
              key={item.id}
              className={`tree-row ${active === documentKey({ kind: "scene", id: item.id, sceneId: item.id }) ? "selected" : ""}`}
              onClick={() => chooseScene(item.id)}
            >
              <Layers3 size={15} />
              <span>{item.name}</span>
              {item.id === project.startSceneId && (
                <small className="push">Entry</small>
              )}
            </button>
          ))}
      </details>
      <details className="tree-group" open>
        <summary>
          <Folder size={15} /> Interfaces
          <button
            className="icon-button push"
            aria-label="New UI screen"
            onClick={(event) => {
              event.preventDefault();
              newUiScreen();
            }}
          >
            <Plus size={15} />
          </button>
        </summary>
        {matches("Project.uiflow") &&
          row("Project.uiflow", uiFlowDocument, Layers3)}
        {project.uiFlow?.screens
          .filter(({ name }) => matches(name))
          .map(({ id, name }) =>
            row(name + ".ui", { kind: "uiScreen", id }, Layers3),
          )}
      </details>
      <details className="tree-group">
        <summary>
          <Folder size={15} /> Audio Creation
          <button
            className="icon-button push"
            aria-label="New sound patch"
            onClick={(event) => {
              event.preventDefault();
              newPatch();
            }}
          >
            <Plus size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="New tracker song"
            onClick={(event) => {
              event.preventDefault();
              newTracker();
            }}
          >
            <Plus size={15} />
          </button>
        </summary>
        {project.audioCreation?.patches
          .filter(({ name }) => matches(name))
          .map(({ id, name }) => row(name + ".synth", { kind: "synth", id }))}
        {project.audioCreation?.songs
          .filter(({ name }) => matches(name))
          .map(({ id, name }) =>
            row(name + ".tracker", { kind: "tracker", id }),
          )}
      </details>
      <details className="tree-group">
        <summary>
          <Folder size={15} /> Behavior Trees
          <button
            className="icon-button push"
            aria-label="New Behavior Tree"
            onClick={(event) => {
              event.preventDefault();
              newBehaviorTree();
            }}
          >
            <Plus size={15} />
          </button>
        </summary>
        {project.behaviorTrees
          ?.filter(({ name }) => matches(name))
          .map(({ id, name }) =>
            row(name + ".behavior", { kind: "behaviorTree", id }),
          )}
      </details>
      <details className="tree-group">
        <summary>
          <Folder size={15} /> Scene Assets
        </summary>
        {matches(scene.name) && (
          <>
            {row(scene.name + ".tilemap", sceneRef("tilemap"), Layers3)}
            {row(scene.name + ".ui", sceneRef("ui"), Layers3)}
          </>
        )}
        {scene.tilemap.layers
          ?.filter(({ name }) => matches(name))
          .map(({ id, name }) =>
            row(name + ".tilemap", sceneRef("tilemap", id), Layers3),
          )}
        {scene.timelines
          ?.filter(({ name }) => matches(name))
          .map(({ id, name }) =>
            row(name + ".timeline", sceneRef("timeline", id)),
          )}
        {entities.slice(current * 100, (current + 1) * 100).map((entity) => (
          <div key={entity.id}>
            {row(entity.name + ".entity", sceneRef("entity", entity.id))}
            {(entity.animator || entity.clips.length > 0) &&
              row(entity.name + ".animator", sceneRef("animator", entity.id))}
            {entity.particles &&
              row(entity.name + ".particles", sceneRef("particles", entity.id))}
          </div>
        ))}
        {entities.length > 100 && (
          <div className="inline-actions">
            <button
              disabled={current === 0}
              onClick={() => setEntityPage(current - 1)}
            >
              Previous assets
            </button>
            <button
              disabled={(current + 1) * 100 >= entities.length}
              onClick={() => setEntityPage(current + 1)}
            >
              Next assets
            </button>
          </div>
        )}
      </details>
      <details open className="tree-group">
        <summary>
          <Folder size={15} /> Blueprints
        </summary>
        {project.blueprints
          .filter(({ name }) => matches(name))
          .map(({ id, name }) => row(name, { kind: "blueprint", id }, Code2))}
        {!project.blueprints.length && (
          <small className="tree-empty">No blueprints</small>
        )}
      </details>
      {!!project.prefabs?.length && (
        <details open className="tree-group">
          <summary>
            <Folder size={15} /> Prefabs
          </summary>
          {project.prefabs
            .filter(({ name }) => matches(name))
            .map(({ id, name }) =>
              row(name + ".prefab", { kind: "prefab", id }),
            )}
        </details>
      )}
      <details open className="tree-group">
        <summary>
          <Folder size={15} /> Assets
        </summary>
        {project.assets
          .filter(({ name }) => matches(name))
          .map(({ id, name }) => row(name, { kind: "image", id }, FileImage))}
        {project.mixer?.sounds
          .filter(({ name }) => matches(name))
          .map(({ id, name }) => row(name, { kind: "sound", id }))}
        {matches("Project Data") &&
          row("Project Data.data", { kind: "data", id: "project-data" })}
        {matches("Input") &&
          row("Input.input", { kind: "input", id: "project-input" })}
      </details>
    </div>
  );
}

export function AssetPanel({ onImport }: { onImport: () => void }) {
  const project = useEditor((state) => state.project);
  const { assets } = project;
  const [audit, setAudit] = useState<{
    project: typeof project;
    result: Awaited<ReturnType<typeof auditAssets>>;
  }>();
  const [checking, setChecking] = useState(false);
  const selected = useEditor(selectedEntity);
  const selectedAssetId = useEditor((state) => state.selectedAssetId);
  const asset = assets.find((item) => item.id === selectedAssetId);
  async function validate() {
    setChecking(true);
    try {
      setAudit({ project, result: await auditAssets(project) });
    } finally {
      setChecking(false);
    }
  }
  const alreadyAssigned =
    selected?.visual?.kind === "sprite" &&
    selected.visual.assetId === asset?.id;
  return (
    <div className="panel-body asset-panel">
      <button className="section-button" onClick={onImport}>
        <Upload size={15} /> Import image
      </button>
      <button
        className="section-button"
        onClick={() => void validate()}
        disabled={checking}
      >
        {checking ? "Validating assets…" : "Validate project assets"}
      </button>
      {audit?.project === project && (
        <section aria-label="Asset validation results">
          <p role="status">
            {audit.result.images} images and {audit.result.sounds} sounds
            checked · {audit.result.issueCount} issues
          </p>
          {audit.result.issues.length > 0 && (
            <ul>
              {audit.result.issues.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}
          {audit.result.issueCount > audit.result.issues.length && (
            <p>Showing the first 100 issues.</p>
          )}
        </section>
      )}
      {asset && (
        <section className="asset-details" aria-label="Asset preview">
          <strong>{asset.name}</strong>
          <img src={asset.source} alt={asset.name} />
          <button
            disabled={!selected || alreadyAssigned}
            onClick={() =>
              editEntity((entity) => {
                entity.visual = { kind: "sprite", assetId: asset.id };
                entity.clips = [];
                delete entity.animator;
              })
            }
          >
            {alreadyAssigned
              ? "Assigned to " + selected?.name
              : selected
                ? "Assign to " + selected.name
                : "Select an entity to assign"}
          </button>
        </section>
      )}
    </div>
  );
}

const entityDrag = "application/x-mosaic-entity";
function moveInHierarchy(id: string, parentId: string | null) {
  const state = useEditor.getState();
  const scene = selectedScene(state);
  const entity = scene.entities.find((item) => item.id === id);
  if (!entity || entity.parentId === parentId) return;
  let moved = false;
  editScene((draft) => {
    moved = reparentEntity(draft, id, parentId);
  });
  if (!moved)
    state.report(
      "Choose a parent outside this branch. Physics and navigation require scene roots.",
      "error",
    );
}
function dropEntity(event: DragEvent, parentId: string | null) {
  if (!event.dataTransfer.types.includes(entityDrag)) return;
  event.preventDefault();
  event.stopPropagation();
  moveInHierarchy(event.dataTransfer.getData(entityDrag), parentId);
}

export function HierarchyPanel() {
  const scene = useEditor(selectedScene);
  const entityId = useEditor((state) => state.entityId);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const children = new Map<string | null, Entity[]>();
    for (const item of scene.entities) {
      const list = children.get(item.parentId);
      if (list) list.push(item);
      else children.set(item.parentId, [item]);
    }
    const pending = (children.get(null) ?? [])
      .map((entity) => ({ entity, depth: 0 }))
      .reverse();
    const ordered: { entity: Entity; depth: number; children: boolean }[] = [];
    while (pending.length) {
      const row = pending.pop()!;
      const sub = children.get(row.entity.id) ?? [];
      ordered.push({ ...row, children: sub.length > 0 });
      if (!collapsed.has(row.entity.id))
        for (let i = sub.length - 1; i >= 0; i--)
          pending.push({ entity: sub[i], depth: row.depth + 1 });
    }
    return ordered;
  }, [scene.entities, collapsed]);
  const pageSize = 200;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  return (
    <div className="hierarchy panel-body">
      <div className="inline-actions">
        <button onClick={() => addEntity()}>
          <Plus size={14} /> Entity
        </button>
        <button disabled={!entityId} onClick={() => addEntity("rect", true)}>
          Add Child
        </button>
      </div>
      <button
        className={`tree-row ${!entityId ? "selected" : ""}`}
        onClick={() => chooseEntity(undefined)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(entityDrag))
            event.preventDefault();
        }}
        onDrop={(event) => dropEntity(event, null)}
      >
        <Layers3 size={15} />
        {scene.name}
      </button>
      {rows.length > pageSize && (
        <div className="inline-actions">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous entities
          </button>
          <span>
            {currentPage + 1} / {Math.ceil(rows.length / pageSize)}
          </span>
          <button
            disabled={(currentPage + 1) * pageSize >= rows.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next entities
          </button>
        </div>
      )}
      {rows
        .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
        .map((row) => (
          <div
            key={row.entity.id}
            className={`hierarchy-row ${row.entity.id === entityId ? "selected" : ""}`}
            style={{ paddingLeft: Math.min(9, row.depth) * 13 }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(entityDrag))
                event.preventDefault();
            }}
            onDrop={(event) => dropEntity(event, row.entity.id)}
          >
            {row.children ? (
              <button
                className="tree-chevron"
                aria-label={
                  collapsed.has(row.entity.id)
                    ? "Expand children"
                    : "Collapse children"
                }
                onClick={() =>
                  setCollapsed((old) => {
                    const next = new Set(old);
                    if (next.has(row.entity.id)) next.delete(row.entity.id);
                    else next.add(row.entity.id);
                    return next;
                  })
                }
              >
                {collapsed.has(row.entity.id) ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
            ) : (
              <span className="tree-chevron" />
            )}
            <button
              className="tree-row"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(entityDrag, row.entity.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => chooseEntity(row.entity)}
            >
              <Box size={15} />
              <span>{row.entity.name}</span>
            </button>
          </div>
        ))}
    </div>
  );
}

const transforms = [
  ["x", "X", 0.1],
  ["y", "Y", 0.1],
  ["width", "Width", 1, 1, 8192],
  ["height", "Height", 1, 1, 8192],
  ["rotation", "Rotation", 0.1],
  ["alpha", "Opacity", 0.01, 0, 1],
  ["scaleX", "Scale X", 0.01, -100, 100],
  ["scaleY", "Scale Y", 0.01, -100, 100],
] as const;
export function InspectorPanel() {
  const workspace = useEditor((state) => state.workspace);
  if (
    workspace === "Tilemap" ||
    workspace === "Physics" ||
    workspace === "Cameras" ||
    workspace === "Navigation" ||
    workspace === "Lighting"
  )
    return <WorldInspector tool={workspace} />;
  return workspace === "Blueprints" ? (
    <BlueprintInspector />
  ) : (
    <EntityInspector />
  );
}
function EntityInspector() {
  const scene = useEditor(selectedScene);
  const entity = useEditor(selectedEntity);
  const assets = useEditor((state) => state.project.assets);
  const blueprints = useEditor((state) => state.project.blueprints);
  const trees = useEditor((state) => state.project.behaviorTrees);
  if (!entity) return <SceneSettings />;
  const descendants = hierarchyIds(scene.entities, entity.id);
  const visual = entity.visual;
  return (
    <div className="panel-body inspector">
      <div className="inspector-title">
        <div className="object-icon purple">
          <Box size={20} />
        </div>
        <div>
          <strong>{entity.name}</strong>
          <small>Scene Entity</small>
        </div>
      </div>
      <Section title="Identity">
        <Field label="Name">
          <TextField
            label="Entity name"
            value={entity.name}
            onChange={(name) =>
              editEntity((draft) => {
                draft.name = name;
              })
            }
          />
        </Field>
        <Field label="Parent">
          <select
            aria-label="Entity parent"
            value={entity.parentId ?? ""}
            disabled={!!entity.body || !!entity.navigation}
            onChange={(event) =>
              moveInHierarchy(entity.id, event.target.value || null)
            }
          >
            <option value="">Scene root</option>
            {scene.entities
              .filter((item) => !descendants.has(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Layer">
          <select
            aria-label="Entity layer"
            value={entity.layerId}
            onChange={(event) =>
              editEntity((draft) => {
                draft.layerId = event.target.value;
              })
            }
          >
            {scene.layers.map((layer) => (
              <option value={layer.id} key={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Order">
          <NumberField
            label="Layer order"
            value={entity.order}
            onChange={(order) =>
              editEntity((draft) => {
                draft.order = order;
              })
            }
          />
        </Field>
        {!!trees?.length && (
          <Field label="Behavior Tree">
            <select
              aria-label="Entity Behavior Tree"
              value={entity.behaviorTree ?? ""}
              onChange={(event) =>
                editEntity((draft) => {
                  draft.behaviorTree = event.target.value || undefined;
                })
              }
            >
              <option value="">None</option>
              {trees.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Persistent tree">
          <input
            aria-label="Keep entity tree between scenes"
            type="checkbox"
            checked={!!entity.persistent}
            onChange={(event) =>
              editEntity((draft) => {
                draft.persistent = event.target.checked || undefined;
              })
            }
          />
        </Field>
        <Field label="Visible">
          <input
            type="checkbox"
            checked={entity.visible}
            onChange={(event) =>
              editEntity((draft) => {
                draft.visible = event.target.checked;
              })
            }
          />
        </Field>
      </Section>
      <Section title="Transform">
        <div className="numeric-grid">
          {transforms.map(([key, label, step, min, max]) => (
            <Field key={key} label={label}>
              <NumberField
                label={label}
                value={entity.transform[key]}
                min={min}
                max={max}
                step={step}
                onChange={(value) =>
                  editEntity((draft) => {
                    draft.transform[key] = value;
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Appearance">
        <Field label="Type">
          <select
            aria-label="Appearance type"
            value={visual?.kind ?? ""}
            onChange={(event) =>
              editEntity((draft) => {
                const kind = event.target.value;
                draft.clips = [];
                delete draft.animator;
                if (kind === "rect") draft.visual = { kind, color: "#9670e8" };
                else if (kind === "sprite" && assets[0])
                  draft.visual = { kind, assetId: assets[0].id };
                else if (kind === "text")
                  draft.visual = {
                    kind,
                    text: draft.name,
                    color: "#ffffff",
                    size: 20,
                    screen: false,
                  };
                else draft.visual = null;
              })
            }
          >
            <option value="">None</option>
            <option value="rect">Rectangle</option>
            <option value="sprite" disabled={!assets.length}>
              Sprite
            </option>
            <option value="text">Text</option>
          </select>
        </Field>
        {visual?.kind === "sprite" && (
          <Field label="Image">
            <select
              aria-label="Sprite image"
              value={visual.assetId}
              onChange={(event) =>
                editEntity((draft) => {
                  draft.visual = {
                    kind: "sprite",
                    assetId: event.target.value,
                  };
                  draft.clips = [];
                  delete draft.animator;
                })
              }
            >
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {visual && visual.kind !== "sprite" && (
          <Field label="Color">
            <input
              type="color"
              value={visual.color}
              onChange={(event) =>
                editEntity((draft) => {
                  if (draft.visual && draft.visual.kind !== "sprite")
                    draft.visual.color = event.target.value;
                })
              }
            />
          </Field>
        )}
        {visual?.kind === "text" && (
          <>
            <Field label="Text">
              <TextField
                label="Display text"
                value={visual.text}
                allowEmpty
                maxLength={300}
                onChange={(text) =>
                  editEntity((draft) => {
                    if (draft.visual?.kind === "text") draft.visual.text = text;
                  })
                }
              />
            </Field>
            <Field label="Size">
              <NumberField
                label="Font size"
                value={visual.size}
                min={6}
                max={192}
                onChange={(size) =>
                  editEntity((draft) => {
                    if (draft.visual?.kind === "text") draft.visual.size = size;
                  })
                }
              />
            </Field>
            <Field label="Screen space">
              <input
                type="checkbox"
                checked={visual.screen}
                onChange={(event) =>
                  editEntity((draft) => {
                    if (draft.visual?.kind === "text")
                      draft.visual.screen = event.target.checked;
                  })
                }
              />
            </Field>
          </>
        )}
      </Section>
      <Section title="Behaviour">
        <Field label="Blueprint">
          <select
            aria-label="Entity blueprint"
            value={entity.blueprintId ?? ""}
            onChange={(event) =>
              editEntity((draft) => {
                draft.blueprintId = event.target.value || null;
              })
            }
          >
            <option value="">None</option>
            {blueprints.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        {entity.blueprintId && (
          <button
            onClick={() => {
              openDocument({ kind: "blueprint", id: entity.blueprintId! });
              useEditor.setState({ attachmentId: primaryAttachmentId });
            }}
          >
            <Code2 size={14} /> Edit Blueprint
          </button>
        )}
        <BlueprintAttachments entity={entity} blueprints={blueprints} />
      </Section>
      <ComponentInspector entity={entity} scene={scene} />
      <button
        className="danger section-button"
        onClick={() => removeEntity(entity.id)}
      >
        <Trash2 size={14} /> Delete Entity
      </button>
    </div>
  );
}

export function SceneSettings() {
  const scene = useEditor(selectedScene);
  const project = useEditor((state) => state.project);
  return (
    <div className="panel-body inspector">
      <div className="inspector-title">
        <div className="object-icon purple">
          <Layers3 size={20} />
        </div>
        <div>
          <strong>{scene.name}</strong>
          <small>Scene settings</small>
        </div>
      </div>
      <Section title="Scene">
        <Field label="Name">
          <TextField
            label="Scene name"
            value={scene.name}
            onChange={(name) =>
              editScene((draft) => {
                draft.name = name;
              })
            }
          />
        </Field>
        <Field label="Background">
          <input
            type="color"
            value={scene.background}
            onChange={(event) =>
              editScene((draft) => {
                draft.background = event.target.value;
              })
            }
          />
        </Field>
        <Field label="Starting scene">
          <input
            type="checkbox"
            checked={project.startSceneId === scene.id}
            disabled={project.startSceneId === scene.id}
            onChange={() =>
              useEditor.getState().edit((draft) => {
                draft.startSceneId = scene.id;
              })
            }
          />
        </Field>
        <div className="numeric-grid">
          {(["width", "height"] as const).map((key) => (
            <Field key={key} label={key}>
              <NumberField
                label={`Project ${key}`}
                min={1}
                max={8192}
                value={project[key]}
                onChange={(value) =>
                  useEditor.getState().edit((draft) => {
                    draft[key] = value;
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Camera">
        <div className="numeric-grid">
          {(["x", "y", "zoom", "offsetY"] as const).map((key) => (
            <Field
              key={key}
              label={key === "offsetY" ? "Follow offset Y" : key}
            >
              <NumberField
                label={`Camera ${key}`}
                value={scene.camera[key]}
                step={0.01}
                min={key === "zoom" ? 0.05 : undefined}
                max={key === "zoom" ? 8 : undefined}
                onChange={(value) =>
                  editScene((draft) => {
                    draft.camera[key] = value;
                  })
                }
              />
            </Field>
          ))}
        </div>
        <Field label="Follow">
          <select
            aria-label="Camera follow"
            value={scene.camera.follow ?? ""}
            onChange={(event) =>
              editScene((draft) => {
                draft.camera.follow = event.target.value || null;
              })
            }
          >
            <option value="">Fixed</option>
            {scene.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>
      <Section title="Layers">
        {scene.layers.map((layer, index) => (
          <div className="layer-row" key={layer.id}>
            <input
              type="checkbox"
              aria-label={`Show ${layer.name}`}
              checked={layer.visible}
              onChange={(event) =>
                editScene((draft) => {
                  draft.layers[index].visible = event.target.checked;
                })
              }
            />
            <TextField
              label="Layer name"
              value={layer.name}
              onChange={(name) =>
                editScene((draft) => {
                  draft.layers[index].name = name;
                })
              }
            />
            <button
              aria-label={`Move layer ${layer.name} up`}
              disabled={index === 0}
              onClick={() =>
                editScene((draft) => {
                  [draft.layers[index - 1], draft.layers[index]] = [
                    draft.layers[index],
                    draft.layers[index - 1],
                  ];
                })
              }
            >
              ↑
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            editScene((draft) => {
              draft.layers.push({
                id: newId(),
                name: `Layer ${draft.layers.length + 1}`,
                visible: true,
              });
            })
          }
        >
          <Plus size={14} /> Layer
        </button>
      </Section>
      <Section title="Tilemap">
        {(["width", "height", "size"] as const).map((key) => (
          <Field label={key} key={key}>
            <NumberField
              label={`Tilemap ${key}`}
              value={scene.tilemap[key]}
              min={key === "size" ? 4 : 1}
              max={key === "size" ? 128 : 256}
              onChange={(value) =>
                editScene((draft) => {
                  resizeMap(draft, key, value);
                })
              }
            />
          </Field>
        ))}
      </Section>
    </div>
  );
}

export function ConsolePanel() {
  const messages = useEditor((state) => state.messages);
  const logs = useEditor((state) => state.snapshot.logs);
  const entries = [...messages, ...logs];
  return (
    <div className="panel-body console-panel">
      <div className="panel-head">
        <strong>Runtime & Editor</strong>
        <button
          onClick={() => {
            const game = playGame();
            if (game) game.logs.length = 0;
            useEditor.setState((state) => ({
              messages: [],
              snapshot: { ...state.snapshot, logs: [] },
            }));
          }}
        >
          Clear
        </button>
      </div>
      {entries.length ? (
        entries.map((entry, index) => (
          <div key={index} className={`console-entry ${entry.level}`}>
            <span>{entry.level}</span>
            {entry.message}
            {entry.blockId && (
              <button
                className="diagnostic-link"
                onClick={() => {
                  const state = useEditor.getState();
                  const entity = selectedScene(state).entities.find(
                    (item) => item.id === entry.entityId,
                  );
                  revealBlock(
                    state.project.blueprints.find(
                      (item) =>
                        item.id === (entry.blueprintId ?? entity?.blueprintId),
                    ),
                    entry.blockId!,
                  );
                }}
              >
                {entry.blockId}
              </button>
            )}
          </div>
        ))
      ) : (
        <div className="subtle-copy">
          Play the scene to see execution logs and diagnostics.
        </div>
      )}
    </div>
  );
}

export function DebugPanel() {
  const snapshot = useEditor((state) => state.snapshot);
  const entity = useEditor(selectedEntity);
  const attachmentId = useEditor((state) => state.attachmentId);
  const attachment =
    entity?.attachments?.find(
      ({ id, enabled }) => id === attachmentId && enabled,
    ) ??
    (!entity?.blueprintId
      ? entity?.attachments?.find(({ enabled }) => enabled)
      : undefined);
  const blueprint = useEditor((state) =>
    state.project.blueprints.find(
      (item) =>
        item.id ===
        (snapshot.pause?.blueprintId ??
          attachment?.blueprintId ??
          entity?.blueprintId),
    ),
  );
  const transport = useEditor((state) => state.transport);
  const variables = (blueprint?.variables ?? []).map((variable) => ({
    ...variable,
    value:
      snapshot.variables.find((entry) => entry.id === variable.id)?.value ??
      variable.initial,
  }));
  for (const [id, value] of snapshot.pause?.locals ?? []) {
    variables.push({
      id,
      name: symbolName(blueprint, id),
      type: typeOf(value),
      initial: value,
      value,
    });
  }
  return (
    <div className="panel-body debug-panel">
      <div>
        <div className="panel-head">
          <strong>Variables{entity ? ` · ${entity.name}` : ""}</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className="variable-dot" />
                  {v.name}
                </td>
                <td>{v.type}</td>
                <td>{displayValue(v.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="panel-head">
          <strong>Execution Activity</strong>
          <span>{snapshot.time.toFixed(2)} s</span>
        </div>
        {transport !== "editing" && (
          <div className="debug-controls">
            <button
              disabled={!snapshot.pause || transport !== "paused"}
              onClick={stepBlueprint}
            >
              Step Block
            </button>
            {transport === "paused" && (
              <button onClick={() => useEditor.getState().play()}>
                Resume
              </button>
            )}
          </div>
        )}
        {snapshot.pause && (
          <div className="debug-frame" data-testid="blueprint-pause">
            <strong>Paused before block</strong>
            {snapshot.pause.stack.map((frame, depth) => (
              <span key={depth + frame.entryId}>{frame.name}</span>
            ))}
          </div>
        )}
        <div className="subtle-copy" data-testid="runtime-position">
          {snapshot.position
            ? `Position ${snapshot.position.x.toFixed(1)}, ${snapshot.position.y.toFixed(1)}`
            : "No runtime entity selected"}
        </div>
        {snapshot.blocks.slice(0, 10).map((block) => (
          <div key={block} className="debug-step">
            <span className="dot playing" />
            {block}
          </div>
        ))}
      </div>
    </div>
  );
}
