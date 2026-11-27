import { produce } from "immer";
import { create } from "zustand";
import { exampleProject } from "@mosaic/example";
import {
  parseProject,
  attachmentBlueprints,
  primaryAttachmentId,
  serializeProject,
  type Entity,
  type Project,
  type Scene,
} from "@mosaic/model";
import { typeOf, type Blueprint, type Value } from "@mosaic/blueprints";
import type { Preference } from "@mosaic/render";
import type { BlueprintPause, RuntimeLog } from "@mosaic/runtime";
import type { ProjectLocation } from "../../desktop/src/contracts";

import {
  documentInfo,
  documentKey,
  editors,
  restoreDocumentRefs,
  sceneDocument,
  sceneFlowDocument,
  uiFlowDocument,
  type DocumentRef,
  type Workspace,
} from "./documents";
export { editors as workspaces, type Workspace } from "./documents";

type Transport = "editing" | "playing" | "paused";
type Snapshot = {
  blocks: string[];
  variables: { id: string; value: Value }[];
  logs: RuntimeLog[];
  time: number;
  position?: { x: number; y: number };
  pause?: BlueprintPause;
};
const emptySnapshot: Snapshot = {
  blocks: [],
  variables: [],
  logs: [],
  time: 0,
};
const project = exampleProject();
type Breakpoints = Record<string, string[]>;
function breakpointKey(projectId: string) {
  return "mosaic-breakpoints:" + projectId;
}
function readBreakpoints(projectId: string): Breakpoints {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(breakpointKey(projectId)) ?? "{}",
    );
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, ids]) =>
          Array.isArray(ids) && ids.every((id) => typeof id === "string"),
      ),
    );
  } catch {
    return {};
  }
}
type EditorState = {
  project: Project;
  past: Project[];
  future: Project[];
  saved: Project;
  location?: ProjectLocation;
  sceneId: string;
  entityId: string | null;
  widgetId: string | null;
  blueprintId: string | null;
  attachmentId: string | null;
  selectedAssetId: string | null;
  activeTileLayer: string | null;
  activeTerrain: string | null;
  workspace: Workspace;
  documents: DocumentRef[];
  activeDocument: string | null;
  selectedTile: string | null;
  eventId: string | null;
  transport: Transport;
  runId: number;
  preference: Preference;
  snapshot: Snapshot;
  breakpoints: Breakpoints;
  toggleBreakpoint(blueprintId: string, blockId: string): void;
  messages: RuntimeLog[];
  edit(recipe: (project: Project) => void): void;
  undo(): void;
  redo(): void;
  load(project: Project, location?: ProjectLocation): void;
  save(project: Project, location?: ProjectLocation): void;
  play(): void;
  pause(): void;
  stop(): void;
  restart(): void;
  report(message: string, level?: RuntimeLog["level"]): void;
};

export const useEditor = create<EditorState>((set) => ({
  project,
  past: [],
  future: [],
  saved: project,
  sceneId: project.startSceneId,
  entityId: "player",
  widgetId: null,
  blueprintId: "movement",
  attachmentId: primaryAttachmentId,
  selectedAssetId: null,
  activeTileLayer: null,
  activeTerrain: null,
  eventId: "update-event",
  selectedTile: null,
  workspace: "Blueprints",
  documents: [{ kind: "blueprint", id: "movement" }],
  activeDocument: documentKey({ kind: "blueprint", id: "movement" }),
  transport: "editing",
  runId: 0,
  preference:
    localStorage.getItem("mosaic-renderer") === "canvas"
      ? "canvas"
      : localStorage.getItem("mosaic-renderer") === "pixi"
        ? "pixi"
        : "auto",
  snapshot: emptySnapshot,
  breakpoints: readBreakpoints(project.id),
  toggleBreakpoint: (blueprintId, blockId) =>
    set((state) => {
      const ids = Object.hasOwn(state.breakpoints, blueprintId)
        ? state.breakpoints[blueprintId]
        : [];
      const toggled = ids.includes(blockId)
        ? ids.filter((id) => id !== blockId)
        : [...ids, blockId];
      const breakpoints = { ...state.breakpoints, [blueprintId]: toggled };
      localStorage.setItem(
        breakpointKey(state.project.id),
        JSON.stringify(breakpoints),
      );
      return { breakpoints };
    }),
  messages: [],
  edit: (recipe) =>
    set((state) => {
      const next = produce(state.project, recipe);
      return next === state.project
        ? state
        : {
            project: next,
            past: [...state.past.slice(-49), state.project],
            future: [],
          };
    }),
  undo: () =>
    set((state) =>
      state.past.length
        ? {
            project: state.past.at(-1)!,
            past: state.past.slice(0, -1),
            future: [state.project, ...state.future],
          }
        : state,
    ),
  redo: () =>
    set((state) =>
      state.future.length
        ? {
            project: state.future[0],
            past: [...state.past, state.project],
            future: state.future.slice(1),
          }
        : state,
    ),
  load: (next, location) =>
    set((state) => ({
      project: next,
      saved: next,
      past: [],
      future: [],
      location,
      sceneId: next.startSceneId,
      entityId:
        next.scenes
          .find((scene) => scene.id === next.startSceneId)
          ?.entities.find(
            (entity) =>
              entity.blueprintId ||
              entity.attachments?.some(({ enabled }) => enabled),
          )?.id ?? null,
      blueprintId: next.blueprints[0]?.id ?? null,
      attachmentId: null,
      selectedAssetId: null,
      widgetId: null,
      activeTileLayer: null,
      activeTerrain: null,
      breakpoints: readBreakpoints(next.id),
      eventId: null,
      selectedTile: null,
      transport: "editing",
      runId: state.runId + 1,
      snapshot: emptySnapshot,
    })),
  save: (next, location) => set({ saved: next, location }),
  play: () =>
    set((state) =>
      state.transport === "editing"
        ? {
            transport: "playing",
            runId: state.runId + 1,
            snapshot: emptySnapshot,
          }
        : { transport: "playing" },
    ),
  pause: () =>
    set((state) =>
      state.transport === "playing" ? { transport: "paused" } : state,
    ),
  stop: () => set({ transport: "editing" }),
  restart: () =>
    set((state) => ({
      transport: "playing",
      runId: state.runId + 1,
      snapshot: emptySnapshot,
    })),
  report: (message, level = "info") =>
    set((state) => ({
      messages: [...state.messages.slice(-99), { message, level }],
    })),
}));

export const selectedScene = (state: EditorState) =>
  state.project.scenes.find((scene) => scene.id === state.sceneId) ??
  state.project.scenes.find(
    (scene) => scene.id === state.project.startSceneId,
  )!;
export const selectedEntity = (state: EditorState) =>
  selectedScene(state).entities.find((entity) => entity.id === state.entityId);
export const selectedBlueprint = (state: EditorState) =>
  state.project.blueprints.find(
    (blueprint) => blueprint.id === state.blueprintId,
  ) ?? state.project.blueprints[0];

export function editScene(recipe: (scene: Scene, project: Project) => void) {
  const state = useEditor.getState();
  const id = selectedScene(state).id;
  state.edit((project) => {
    const scene = project.scenes.find((scene) => scene.id === id);
    if (scene) recipe(scene, project);
  });
}
export function editEntity(
  recipe: (entity: Entity, scene: Scene, project: Project) => void,
) {
  const id = useEditor.getState().entityId;
  editScene((scene, project) => {
    const entity = scene.entities.find((entity) => entity.id === id);
    if (entity) recipe(entity, scene, project);
  });
}
export function editBlueprint(recipe: (blueprint: Blueprint) => void) {
  const state = useEditor.getState();
  const id = selectedBlueprint(state)?.id;
  state.edit((project) => {
    const blueprint = project.blueprints.find(
      (blueprint) => blueprint.id === id,
    );
    if (blueprint) {
      const previous = new Map(
        blueprint.variables
          .filter(({ exposed }) => exposed)
          .map(({ id, type }) => [id, type]),
      );
      blueprint.version = 2;
      recipe(blueprint);
      const valid = new Map(
        blueprint.variables
          .filter(({ exposed }) => exposed)
          .map(({ id, type }) => [id, type]),
      );
      if (
        valid.size === previous.size &&
        [...valid].every(([key, type]) => previous.get(key) === type)
      )
        return;
      for (const group of [...project.scenes, ...(project.prefabs ?? [])])
        for (const entity of group.entities)
          for (const attachment of entity.attachments ?? [])
            if (attachment.blueprintId === id && attachment.overrides)
              for (const [key, value] of Object.entries(attachment.overrides))
                if (valid.get(key) !== typeOf(value))
                  delete attachment.overrides[key];
    }
  });
}
export function activeDocument(state: EditorState) {
  return state.documents.find(
    (ref) => documentKey(ref) === state.activeDocument,
  );
}

export function openDocument(
  ref: DocumentRef,
  options: { workspace?: Workspace; resetSelection?: boolean } = {},
) {
  const state = useEditor.getState();
  const info = documentInfo(state.project, ref);
  if (!info) return;
  const key = documentKey(ref);
  const sameScene = !ref.sceneId || ref.sceneId === state.sceneId;
  useEditor.setState({
    documents: state.documents.some((old) => documentKey(old) === key)
      ? state.documents
      : [...state.documents, ref],
    activeDocument: key,
    workspace: options.workspace ?? info.workspace,
    ...(ref.sceneId ? { sceneId: ref.sceneId } : {}),
    ...(!sameScene ? { transport: "editing" as const } : {}),
    ...(!sameScene || options.resetSelection
      ? { entityId: null, widgetId: null }
      : {}),
    ...((ref.kind === "uiScreen" || ref.kind === "ui") &&
    key !== state.activeDocument
      ? { widgetId: null }
      : {}),
    ...(ref.kind === "blueprint" && ref.id !== state.blueprintId
      ? { blueprintId: ref.id, eventId: null, selectedTile: null }
      : {}),
    ...(ref.kind === "image" ? { selectedAssetId: ref.id } : {}),
    ...(["entity", "animator", "particles"].includes(ref.kind)
      ? { entityId: ref.id }
      : {}),
    ...(ref.kind === "tilemap" && ref.id !== ref.sceneId
      ? { activeTileLayer: ref.id }
      : {}),
  });
}

export function closeDocument(ref: DocumentRef) {
  const state = useEditor.getState();
  const key = documentKey(ref);
  const index = state.documents.findIndex((item) => documentKey(item) === key);
  if (index < 0) return;
  const documents = state.documents.filter(
    (item) => documentKey(item) !== key && documentInfo(state.project, item),
  );
  useEditor.setState({ documents });
  if (state.activeDocument !== key) return;
  const next = documents[index] ?? documents[index - 1];
  if (next) openDocument(next);
  else useEditor.setState({ activeDocument: null });
}

export function chooseScene(sceneId: string) {
  openDocument(sceneDocument(sceneId), { resetSelection: true });
}

export function openEditor(workspace: Workspace) {
  const state = useEditor.getState();
  const scene = selectedScene(state);
  const selected = selectedEntity(state) ?? scene.entities[0];
  const forScene = (kind: DocumentRef["kind"], id = scene.id) =>
    openDocument({ kind, id, sceneId: scene.id }, { workspace });
  switch (workspace) {
    case "UI Flow":
      openDocument(uiFlowDocument);
      break;
    case "Scene Flow":
      openDocument(sceneFlowDocument);
      break;
    case "Blueprints": {
      const blueprint = selectedBlueprint(state);
      if (blueprint) openDocument({ kind: "blueprint", id: blueprint.id });
      else {
        forScene("scene");
      }
      break;
    }
    case "Animator":
      if (selected) forScene("animator", selected.id);
      else forScene("scene");
      break;
    case "Particles":
      if (selected) forScene("particles", selected.id);
      else forScene("scene");
      break;
    case "Tilemap":
      forScene("tilemap");
      break;
    case "Timeline":
      forScene("timeline");
      break;
    case "UI":
      forScene("ui");
      break;
    case "Data":
      openDocument({ kind: "data", id: "project-data" });
      break;
    case "Input":
      openDocument({ kind: "input", id: "project-input" });
      break;
    default:
      forScene("scene");
  }
}
export function chooseEntity(entity: Entity | undefined) {
  const blueprint = entity && attachmentBlueprints(entity)[0];
  useEditor.setState({
    entityId: entity?.id ?? null,
    ...(blueprint ? { blueprintId: blueprint } : {}),
    attachmentId: entity?.blueprintId
      ? primaryAttachmentId
      : (entity?.attachments?.find(({ enabled }) => enabled)?.id ?? null),
  });
}

type Autosave = {
  source: string;
  workspace: Workspace;
  sceneId: string;
  entityId: string | null;
  blueprintId: string | null;
  documents?: DocumentRef[];
  activeDocument?: string | null;
};
function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mosaic-editor", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export async function initAutosave() {
  const baseline = useEditor.getState().project;
  try {
    const db = await openDatabase();
    const restored = await new Promise<Autosave | undefined>(
      (resolve, reject) => {
        const read = db
          .transaction("workspace")
          .objectStore("workspace")
          .get("autosave");
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      },
    );
    if (restored && useEditor.getState().project === baseline) {
      try {
        const project = parseProject(restored.source);
        useEditor.getState().load(project);
        const { workspace, sceneId, entityId, blueprintId } = restored;
        useEditor.setState({
          workspace: editors.includes(workspace) ? workspace : "Scene",
          sceneId,
          entityId,
          blueprintId,
        });
        const documents = restoreDocumentRefs(project, restored.documents);
        if (restored.documents) {
          const ref = documents.find(
            (entry) => documentKey(entry) === restored.activeDocument,
          );
          useEditor.setState({
            documents,
            activeDocument: ref ? documentKey(ref) : null,
          });
          if (ref)
            openDocument(ref, {
              workspace: editors.includes(workspace) ? workspace : "Scene",
            });
        } else {
          openEditor(editors.includes(workspace) ? workspace : "Scene");
        }
      } catch (error) {
        useEditor
          .getState()
          .report(`Autosave could not be restored. ${String(error)}`, "error");
      }
    }
    let timer: number;
    const save = () => {
      try {
        const {
          project,
          workspace,
          sceneId,
          entityId,
          blueprintId,
          documents,
          activeDocument,
        } = useEditor.getState();
        const transaction = db.transaction("workspace", "readwrite");
        transaction.onabort = () =>
          useEditor
            .getState()
            .report("Autosave could not write to IndexedDB.", "error");
        transaction.objectStore("workspace").put(
          {
            source: serializeProject(project),
            workspace,
            sceneId,
            entityId,
            blueprintId,
            documents,
            activeDocument,
          },
          "autosave",
        );
      } catch (error) {
        useEditor
          .getState()
          .report(`Autosave failed. ${String(error)}`, "error");
      }
    };
    useEditor.subscribe((state, previous) => {
      if (
        state.project === previous.project &&
        state.workspace === previous.workspace &&
        state.sceneId === previous.sceneId &&
        state.entityId === previous.entityId &&
        state.blueprintId === previous.blueprintId &&
        state.documents === previous.documents &&
        state.activeDocument === previous.activeDocument
      )
        return;
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 250);
    });
    window.addEventListener("pagehide", () => {
      window.clearTimeout(timer);
      save();
    });
  } catch (error) {
    useEditor
      .getState()
      .report(`Local autosave is unavailable. ${String(error)}`, "error");
  }
}
