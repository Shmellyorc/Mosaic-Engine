import { produce } from "immer";
import { create } from "zustand";
import { exampleProject } from "@mosaic/example";
import {
  parseProject,
  serializeProject,
  type Entity,
  type Project,
  type Scene,
} from "@mosaic/model";
import type { Blueprint, Value } from "@mosaic/blueprints";
import type { Preference } from "@mosaic/render";
import type { BlueprintPause, RuntimeLog } from "@mosaic/runtime";
import type { ProjectLocation } from "../../desktop/src/contracts";

export const workspaces = [
  "Scene",
  "Blueprints",
  "Tilemap",
  "Physics",
  "Cameras",
  "Navigation",
  "Lighting",
  "Animator",
  "UI",
  "Input",
] as const;
export type Workspace = (typeof workspaces)[number];
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
  blueprintId: string | null;
  selectedAssetId: string | null;
  activeTileLayer: string | null;
  activeTerrain: string | null;
  workspace: Workspace;
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
  blueprintId: "movement",
  selectedAssetId: null,
  activeTileLayer: null,
  activeTerrain: null,
  eventId: "update-event",
  selectedTile: null,
  workspace: "Blueprints",
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
          ?.entities.find((entity) => entity.blueprintId)?.id ?? null,
      blueprintId: next.blueprints[0]?.id ?? null,
      selectedAssetId: null,
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
      blueprint.version = 2;
      recipe(blueprint);
    }
  });
}
export function chooseScene(sceneId: string) {
  useEditor.setState({
    sceneId,
    entityId: null,
    transport: "editing",
    workspace: "Scene",
  });
}
export function chooseEntity(entity: Entity | undefined) {
  useEditor.setState({
    entityId: entity?.id ?? null,
    ...(entity?.blueprintId ? { blueprintId: entity.blueprintId } : {}),
  });
}

type Autosave = {
  source: string;
  workspace: Workspace;
  sceneId: string;
  entityId: string | null;
  blueprintId: string | null;
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
          workspace: workspaces.includes(workspace) ? workspace : "Scene",
          sceneId,
          entityId,
          blueprintId,
        });
      } catch (error) {
        useEditor
          .getState()
          .report(`Autosave could not be restored. ${String(error)}`, "error");
      }
    }
    let timer: number;
    const save = () => {
      try {
        const { project, workspace, sceneId, entityId, blueprintId } =
          useEditor.getState();
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
        state.blueprintId === previous.blueprintId
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
