import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { literal, type Blueprint } from "@mosaic/blueprints";
import {
  applyPrefabRevision,
  capturePrefab,
  createBody,
  createEntity,
  createProject,
  instantiatePrefab,
  parseProject,
  prefabDefaults,
  prefabOverrides,
  publishPrefabOverrides,
  reparentEntity,
  resetPrefabProperties,
  serializeProject,
  validateProject,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";
import { signalMixer } from "../packages/example/src/signal-lab";

function fixture() {
  const project = createProject("Entity fixture");
  const scene = project.scenes[0];
  const source = createEntity(scene.layers[0].id, "Prototype");
  const child = createEntity(scene.layers[0].id, "Child");
  child.parentId = source.id;
  scene.entities.push(source, child);
  const behavior: Blueprint = {
    id: "move",
    name: "Move",
    version: 2,
    variables: [
      { id: "speed", name: "Speed", exposed: true, initial: 1, type: "number" },
    ],
    events: [
      {
        id: "start",
        kind: "start",
        blocks: [{ id: "announce", kind: "log", value: literal("started") }],
      },
      {
        id: "update",
        kind: "update",
        blocks: [
          {
            id: "apply",
            kind: "property",
            property: "alpha",
            target: literal({ kind: "entity", id: child.id }),
            value: literal(0.5),
          },
          {
            id: "increment",
            kind: "set",
            variable: "speed",
            value: {
              kind: "binary",
              op: "+",
              left: { kind: "variable", id: "speed" },
              right: literal(1),
            },
          },
        ],
      },
    ],
  };
  project.blueprints.push(behavior);
  return { project, scene, source, child, behavior };
}

describe("Entity world", () => {
  it("keeps handles through reload, invalidates reused slots and rejects handles from another world", () => {
    const { project, source, child } = fixture();
    const game = new Game(project);
    const handle = game.getEntityHandle(child.id)!;
    const actor = game.getEntityHandle(source.id)!;
    expect(new Game(project).resolveEntity(handle)).toBeUndefined();
    expect(game.resolveEntity(handle)?.id).toBe(child.id);
    const edited = produce(project, (draft) => {
      draft.scenes[0].entities[0].body = createBody();
      draft.scenes[0].entities.pop();
    });
    game.reloadProject(edited);
    expect(game.resolveEntity(handle)).toBeUndefined();
    expect(game.resolveEntity(actor)?.id).toBe(source.id);
    expect(game.queryEntities("body", "visual").map(({ id }) => id)).toEqual([
      source.id,
    ]);
    const added = createEntity(project.scenes[0].layers[0].id);
    game.reloadProject(
      produce(edited, (draft) => {
        draft.scenes[0].entities.push(added);
      }),
    );
    expect(game.getEntityHandle(added.id)?.index).toBe(handle.index);
    expect(game.getEntityHandle(added.id)?.generation).not.toBe(
      handle.generation,
    );
    expect(game.resolveEntity(handle)).toBeUndefined();
  });

  it("retains independent attachment variables by stable identity and applies authored override changes", () => {
    const { project, source, behavior } = fixture();
    source.blueprintId = behavior.id;
    source.attachments = [
      {
        id: "alpha",
        blueprintId: behavior.id,
        enabled: true,
        overrides: { speed: 10 },
      },
      {
        id: "beta",
        blueprintId: behavior.id,
        enabled: true,
        overrides: { speed: 30 },
      },
    ];
    const parsed = parseProject(serializeProject(project));
    expect(parsed.version).toBe(2);
    const game = new Game(parsed);
    game.advance(STEP);
    expect(game.getVariables(source.id, "primary")?.get("speed")).toBe(2);
    expect(game.getVariables(source.id, "alpha")?.get("speed")).toBe(11);
    expect(game.getVariables(source.id, "beta")?.get("speed")).toBe(31);
    expect(
      game.logs.filter(({ message }) => message === "started"),
    ).toHaveLength(3);
    const revised = produce(parsed, (draft) => {
      const entries = draft.scenes[0].entities[0].attachments!;
      entries.reverse();
      entries.find(({ id }) => id === "alpha")!.overrides!.speed = 100;
    });
    game.reloadProject(revised);
    game.advance(STEP);
    expect(game.getVariables(source.id, "alpha")?.get("speed")).toBe(101);
    expect(game.getVariables(source.id, "beta")?.get("speed")).toBe(32);
    expect(
      game.logs.filter(({ message }) => message === "started"),
    ).toHaveLength(3);
    const dependency = produce(revised, (draft) => {
      draft.blueprints[0].requires = ["body"];
    });
    game.reloadProject(dependency);
    expect(game.queryEntities("blueprints")).toHaveLength(1);
    expect(game.getVariables(source.id)).toBeUndefined();
    expect(
      game.logs.some(({ message }) =>
        message.includes("Missing required body"),
      ),
    ).toBe(true);
    game.reloadProject(
      produce(dependency, (draft) => {
        draft.scenes[0].entities[0].body = createBody();
      }),
    );
    expect(game.getVariables(source.id, "alpha")?.get("speed")).toBe(100);
    expect(
      game.logs.filter(({ message }) => message === "started"),
    ).toHaveLength(6);
  });

  it("links complete prefab trees, binds template references within each instance and propagates inherited properties", () => {
    const { project, source, child, scene, behavior } = fixture();
    source.attachments = [
      { id: "driver", enabled: true, blueprintId: behavior.id },
    ];
    const prefab = capturePrefab(scene, source.id);
    project.prefabs = [prefab];
    scene.entities = [];
    const left = instantiatePrefab(prefab, scene, { x: 32, y: 48 });
    const right = instantiatePrefab(prefab, scene, { x: 168, y: 48 });
    scene.entities.push(...left, ...right);
    expect(left[1].parentId).toBe(left[0].id);
    expect(right[1].parentId).toBe(right[0].id);
    expect(left[0].transform.x).toBe(32);
    const game = new Game(parseProject(serializeProject(project)));
    game.advance(STEP);
    expect(game.getEntity(left[1].id)?.transform.alpha).toBe(0.5);
    expect(game.getEntity(right[1].id)?.transform.alpha).toBe(0.5);
    expect(game.logs.filter(({ level }) => level === "error")).toEqual([]);
    left[1].name = "Special Child";
    left[1].transform.width = 65;
    const defaults = prefabDefaults(scene, prefab, left[1])!;
    expect(prefabOverrides(left[1], defaults)).toEqual(["name", "transform"]);
    const revised = publishPrefabOverrides(prefab, scene, left[1], [
      "transform",
    ]);
    applyPrefabRevision(project.scenes, prefab, revised);
    project.prefabs = [revised];
    expect(right[1].transform.width).toBe(65);
    expect(left[1].name).toBe("Special Child");
    resetPrefabProperties(left[1], prefabDefaults(scene, revised, left[1])!, [
      "name",
    ]);
    expect(left[1].name).toBe(child.name);
    expect(
      prefabOverrides(left[1], prefabDefaults(scene, revised, left[1])!),
    ).toEqual([]);
    expect(() => validateProject(project)).not.toThrow();
  });

  it("guards reparenting and rejects invalid overrides and instance links", () => {
    const { project, scene, source, child, behavior } = fixture();
    expect(reparentEntity(scene, source.id, child.id)).toBe(false);
    expect(reparentEntity(scene, child.id, null)).toBe(true);
    child.body = createBody();
    expect(reparentEntity(scene, child.id, source.id)).toBe(false);
    source.attachments = [
      {
        id: "bad",
        enabled: true,
        blueprintId: behavior.id,
        overrides: { speed: false },
      },
    ];
    expect(() => serializeProject(project)).toThrow(/override/);
    delete source.attachments;
    source.prefab = {
      assetId: "unknown",
      instanceId: "example",
      sourceId: "lost",
    };
    expect(() => serializeProject(project)).toThrow(/prefab instance/);
  });

  it("uses entity camera, tile ownership and audio lifecycle in the runtime", () => {
    const { project, scene, source } = fixture();
    project.mixer = signalMixer();
    source.audio = { soundId: project.mixer.sounds[0].id, autoplay: true };
    source.camera = { enabled: true, zoom: 2 };
    source.tileLayers = ["ground"];
    scene.tilemap.layers = [
      {
        id: "ground",
        name: "Ground",
        layerId: scene.layers[0].id,
        visible: true,
        opacity: 1,
        collision: true,
        navigation: true,
        tiles: [{ x: 10, y: 6, color: "#334422", solid: true }],
      },
    ];
    const game = new Game(parseProject(serializeProject(project)));
    expect(game.view()).toMatchObject({
      x: source.transform.x,
      y: source.transform.y,
      zoom: 2,
    });
    expect(
      game
        .frame()
        .draws.some((draw) => draw.kind === "rect" && draw.color === "#334422"),
    ).toBe(true);
    game.advance(STEP);
    const played: boolean[] = [];
    game.consumeAudio(({ owner, playing }) => {
      if (owner === source.id) played.push(playing);
    });
    expect(played).toEqual([true]);
    const hidden = produce(game.project, (draft) => {
      draft.scenes[0].entities[0].visible = false;
    });
    game.reloadProject(hidden);
    expect(
      game
        .frame()
        .draws.some((draw) => draw.kind === "rect" && draw.color === "#334422"),
    ).toBe(false);
    const removed = produce(hidden, (draft) => {
      draft.scenes[0].entities = [];
    });
    game.reloadProject(removed);
    game.consumeAudio(({ owner, playing }) => {
      if (owner === source.id) played.push(playing);
    });
    expect(played).toEqual([true, false]);
  });
});
