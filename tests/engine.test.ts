import { describe, expect, it, vi } from "vitest";
import { compileBlueprint, literal } from "@mosaic/blueprints";
import {
  createBlueprint,
  createEntity,
  createProject,
  parseProject,
  serializeProject,
  validateProject,
} from "@mosaic/model";
import { exampleProject } from "@mosaic/example";
import { Game, InputState, pickEntity, STEP } from "@mosaic/runtime";
import { rendererFactories, type Renderer } from "@mosaic/render";

describe("Project format", () => {
  it("round trips the sample, stable nested IDs, image data and spritesheet clips", () => {
    const project = exampleProject();
    expect(parseProject(serializeProject(project))).toEqual(project);
    const game = new Game(project);
    const archive = game.frame();
    expect(archive.draws.find((draw) => draw.entityId === "player")?.kind).toBe(
      "sprite",
    );
    expect(pickEntity(archive, 321, 281)).toBe("player");
  });

  it("rejects unknown versions, invalid embedded images, dangling references and cycles", () => {
    const project = createProject();
    const scene = project.scenes[0];
    const parent = createEntity(scene.layers[0].id);
    const child = createEntity(scene.layers[0].id);
    scene.entities.push(parent, child);
    child.parentId = parent.id;
    parent.parentId = child.id;
    expect(() => validateProject(project)).toThrow(/hierarchy cycle/);
    parent.parentId = null;
    child.layerId = "missing";
    expect(() => validateProject(project)).toThrow(/valid layer/);
    expect(() => validateProject({ ...project, version: 3 })).toThrow(
      /Unsupported/,
    );
    expect(() =>
      validateProject({
        ...project,
        assets: [
          { id: "bad", name: "Image", source: "https://example.com/file" },
        ],
      }),
    ).toThrow(/embedded/);
  });

  it("retains parent rotation, scale, layer order, camera, and painted cells", () => {
    const project = createProject();
    const scene = project.scenes[0];
    const layer = scene.layers[0];
    const parent = createEntity(layer.id);
    const child = createEntity(layer.id);
    Object.assign(parent.transform, {
      x: 100,
      y: 100,
      rotation: 90,
      scaleX: 2,
      alpha: 0.5,
    });
    child.parentId = parent.id;
    Object.assign(child.transform, { x: 10, y: 0, alpha: 0.5 });
    const upper = { id: "upper", name: "Upper", visible: true };
    scene.layers.push(upper);
    child.layerId = upper.id;
    scene.entities.push(child, parent);
    scene.tilemap.tiles.push({ x: 0, y: 0, color: "#1100cc" });
    const game = new Game(parseProject(serializeProject(project)));
    const frame = game.frame();
    expect(frame.draws.map((draw) => draw.entityId)).toEqual([
      parent.id,
      undefined,
      child.id,
    ]);
    const draw = frame.draws[2];
    expect(draw.matrix.x).toBeCloseTo(100);
    expect(draw.matrix.y).toBeCloseTo(120);
    expect(draw.alpha).toBe(0.25);
  });
});

describe("Blueprint compilation and fixed-step runtime", () => {
  it("reads input, moves the player, plays frames, follows camera and executes start once", () => {
    const game = new Game(exampleProject(), undefined, true);
    game.start();
    game.input.press("KeyD");
    for (let i = 0; i < 12; i++) game.advance(STEP);
    expect(game.getEntity("player")?.transform.x).toBeCloseTo(415);
    const draw = game
      .frame()
      .draws.find((entry) => entry.entityId === "player");
    expect(draw?.matrix.x).toBe(320);
    expect(draw).toMatchObject({ kind: "sprite", frame: { x: 48 } });
    game.input.release("KeyD");
    game.advance(STEP);
    expect(game.activeBlocks.has("idle-animation")).toBe(true);
    expect(game.activeBlocks.has("move-player")).toBe(false);
    expect(
      game.logs.filter((entry) => entry.blockId === "start-log"),
    ).toHaveLength(1);
    expect(game.getEntity("player")?.transform.x).toBeCloseTo(415);
  });

  it("maps compiler and runtime faults to authoring block IDs", () => {
    const blueprint = createBlueprint();
    blueprint.events[1].blocks.push({
      id: "invalid",
      kind: "move",
      x: literal("fast"),
      y: literal(0),
    });
    expect(compileBlueprint(blueprint, new Set()).diagnostics).toEqual([
      { blockId: "invalid", message: "Expected number, received string." },
    ]);
    const project = exampleProject();
    project.blueprints[0].events[0].blocks.push({
      id: "divide",
      kind: "move",
      x: { kind: "binary", left: literal(1), right: literal(0), op: "/" },
      y: literal(0),
    });
    const game = new Game(project);
    game.advance(STEP * 3);
    expect(game.logs.filter((event) => event.blockId === "divide")).toEqual([
      {
        level: "error",
        entityId: "player",
        blockId: "divide",
        message: "Expression produced a non-finite number.",
      },
    ]);
  });

  it("cancels opposite bindings and clears released input at focus loss", () => {
    const input = new InputState(exampleProject().input);
    input.press("ArrowLeft");
    expect(input.axis("horizontal")).toBe(-1);
    input.press("KeyD");
    expect(input.axis("horizontal")).toBe(0);
    input.release("ArrowLeft");
    expect(input.axis("horizontal")).toBe(1);
    input.clear();
    expect(input.axis("horizontal")).toBe(0);
    expect(input.axis("missing")).toBe(0);
  });
});

describe("Renderer selection", () => {
  const fake = (backend: Renderer["backend"]) => ({
    backend,
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  });
  const options = () => ({
    parent: {} as HTMLElement,
    assets: [],
    report: vi.fn(),
  });
  it("uses compatibility mode explicitly and falls back on accelerated initialization rejection", async () => {
    const pixi = vi.fn().mockRejectedValue(new Error("no accelerator"));
    const canvas = vi.fn(() => fake("canvas"));
    const select = rendererFactories(pixi, canvas);
    const explicit = await select(options(), "canvas", vi.fn());
    expect(explicit.backend).toBe("canvas");
    expect(pixi).not.toHaveBeenCalled();
    const next = options();
    const automatic = await select(next, "auto", vi.fn());
    expect(automatic.backend).toBe("canvas");
    expect(next.report).toHaveBeenCalledWith(
      expect.stringContaining("no accelerator"),
    );
  });

  it("retains viewport dimensions and draws the current scene after a lost context", async () => {
    const accelerated = fake("pixi");
    const canvas = fake("canvas");
    let lose = () => {};
    const select = rendererFactories(
      async (_options, lost) => {
        lose = lost;
        return accelerated;
      },
      () => canvas,
    );
    const chosen = vi.fn();
    const renderer = await select(options(), "auto", chosen);
    const frame = new Game(exampleProject()).frame();
    renderer.resize(710, 340);
    renderer.render(frame);
    expect(renderer.backend).toBe("pixi");
    lose();
    expect(renderer.backend).toBe("canvas");
    expect(accelerated.dispose).toHaveBeenCalledOnce();
    expect(chosen.mock.calls).toEqual([["pixi"], ["canvas"]]);
    expect(canvas.resize).toHaveBeenCalledWith(710, 340);
    expect(canvas.render).toHaveBeenCalledWith(frame);
  });
});
