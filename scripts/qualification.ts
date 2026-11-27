import { relayIslesProject } from "../packages/example/src/games/expansion";
import { strict as assert } from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism, cpus } from "node:os";
import {
  createBody,
  createEmitter,
  createEntity,
  createLight,
  createProject,
  parseProject,
  serializeProject,
  type Tile,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";

const shape = {
  scenery: 16_000,
  bodies: 128,
  emitters: 64,
  lights: 8,
  tileWidth: 256,
  tileHeight: 256,
  warmUp: 90,
  samples: 240,
} as const;
const limits = {
  coldMs: 2000,
  p95Ms: 50,
  maxCandidateEntities: 2000,
  residentChunksPerLayer: 32,
  retainedHeapGrowthMiB: 32,
};

function fixture() {
  const project = createProject("Large world qualification");
  const scene = project.scenes[0];
  const layer = scene.layers[0].id;
  const color = "#516288";
  const tiles: Tile[] = [];
  for (let y = 0; y < shape.tileHeight; y++)
    for (let x = 0; x < shape.tileWidth; x++)
      if ((x + y) % 2 === 0) tiles.push({ x, y, color });
  scene.tilemap = {
    size: 16,
    width: shape.tileWidth,
    height: shape.tileHeight,
    tiles: [],
    layers: [
      {
        id: "ground",
        name: "Ground",
        layerId: layer,
        opacity: 1,
        visible: true,
        collision: false,
        navigation: true,
        tiles,
      },
    ],
  };
  scene.lighting = { enabled: true, ambient: "#9da1bf" };
  for (let i = 0; i < shape.scenery; i++) {
    const entity = createEntity(layer);
    entity.id = "prop-" + i;
    entity.parentId = i > 0 && i % 11 === 0 ? "prop-" + (i - 1) : null;
    Object.assign(entity.transform, {
      x: (i % 160) * 30,
      y: Math.floor(i / 160) * 30,
      width: 12,
      height: 12,
      rotation: i % 9 === 0 ? 22 : 0,
    });
    scene.entities.push(entity);
  }
  for (let i = 0; i < shape.bodies; i++) {
    const entity = createEntity(layer);
    entity.id = "actor-" + i;
    Object.assign(entity.transform, {
      x: (i % 16) * 42,
      y: 30 + Math.floor(i / 16) * 39,
      width: 14,
      height: 14,
    });
    entity.body = { ...createBody(14, 14), velocityX: 3 + (i % 4) };
    if (i < shape.emitters)
      entity.particles = { ...createEmitter(), rate: 20, seed: i + 10 };
    if (i < shape.lights) entity.light = { ...createLight(), radius: 52 };
    scene.entities.push(entity);
  }
  return { project, tiles: tiles.length };
}
function retainedHeap() {
  globalThis.gc?.();
  return process.memoryUsage().heapUsed / (1024 * 1024);
}
function rounded(value: number) {
  return Number(value.toFixed(2));
}
function view(i: number) {
  return { x: 320 + ((i * 19) % 2100), y: 180 + ((i * 7) % 800), zoom: 1 };
}

function qualifySceneResidency() {
  const project = relayIslesProject();
  const region = project.scenes.find(({ id }) => id === "shoal")!;
  const count = 384;
  const cycles = 72;
  const limits = { cycleP95Ms: 100, retainedHeapGrowthMiB: 12 };
  project.behaviorTrees!.push({
    id: "stress-agent",
    name: "Stress Agent",
    blackboard: [{ id: "ready", name: "Ready", initial: false }],
    root: {
      id: "root",
      name: "Update",
      kind: "sequence",
      children: [
        { id: "wait", name: "Wait", kind: "wait", seconds: STEP },
        {
          id: "set",
          name: "Ready",
          kind: "write",
          key: "ready",
          input: { kind: "value", value: true },
        },
      ],
    },
  });
  for (let i = 0; i < count; i++) {
    const entity = createEntity(region.layers[0].id);
    entity.id = "stream-" + i;
    entity.behaviorTree = "stress-agent";
    entity.transform.x = 8 + (i % 24) * 19;
    entity.transform.y = 10 + Math.floor(i / 24) * 19;
    region.entities.push(entity);
  }
  const runtime = new Game(parseProject(serializeProject(project)));
  runtime.advance(0);
  runtime.advance(STEP);
  const carry = runtime.getEntityHandle("harbor-beacon")!;
  const hud = runtime.uiScreens.find(({ id }) => id === "global-hud")!.world;
  let digest = 0;
  function cycle() {
    runtime.controlScene({
      operation: "preload",
      sceneId: region.id,
      offset: { x: 70, y: 12 },
    });
    runtime.controlScene({
      operation: "add",
      sceneId: region.id,
      offset: { x: 70, y: 12 },
    });
    runtime.advance(STEP);
    runtime.advance(STEP);
    runtime.advance(STEP);
    const resolved = runtime.getSceneEntityId(region.id, "stream-0")!;
    assert.equal(runtime.getBehaviorTree(resolved)?.blackboard.ready, true);
    const handle = runtime.getEntityHandle(resolved)!;
    digest = (Math.imul(digest, 31) + runtime.frame().draws.length) >>> 0;
    runtime.controlScene({ operation: "unload", sceneId: region.id });
    runtime.advance(STEP);
    assert.equal(runtime.resolveEntity(handle), undefined);
    assert.equal(runtime.resolveEntity(carry)?.id, "harbor-beacon");
  }
  runtime.controlScene({ operation: "unload", sceneId: region.id });
  runtime.advance(STEP);
  for (let n = 0; n < 12; n++) cycle();
  const start = retainedHeap();
  const timings: number[] = [];
  for (let n = 0; n < cycles; n++) {
    const before = performance.now();
    cycle();
    timings.push(performance.now() - before);
  }
  const growth = retainedHeap() - start;
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
  assert(p95 <= limits.cycleP95Ms, "Scene streaming budget exceeded.");
  assert(
    growth <= limits.retainedHeapGrowthMiB,
    "Scene unload retained too much heap.",
  );
  assert.equal(runtime.sceneStatus.loaded.length, 1);
  assert.equal(runtime.sceneStatus.preloaded.length, 0);
  assert.equal(
    runtime.uiScreens.find(({ id }) => id === "global-hud")?.world,
    hud,
  );
  assert.deepEqual(runtime.logs, []);
  return {
    cycles,
    entitiesPerRegion: count,
    digest,
    p95Ms: rounded(p95),
    retainedHeapGrowthMiB: rounded(growth),
    limits,
  };
}

const { project, tiles } = fixture();
const source = serializeProject(project);
const parsingAt = performance.now();
const parsed = parseProject(source);
const parseMs = performance.now() - parsingAt;
const coldAt = performance.now();
const game = new Game(parsed);
game.frame();
const coldMs = performance.now() - coldAt;
for (let i = 0; i < shape.warmUp; i++) {
  game.advance(STEP);
  game.frame(view(i));
}
const before = retainedHeap();
const samples: number[] = [];
let draws = 0,
  digest = 0,
  maxCandidateEntities = 0,
  maxResidentChunks = 0;
for (let i = 0; i < shape.samples; i++) {
  const start = performance.now();
  game.advance(STEP);
  const count = game.frame(view(i)).draws.length;
  samples.push(performance.now() - start);
  draws += count;
  digest = (Math.imul(digest, 31) + count) >>> 0;
  const metrics = game.renderMetrics();
  maxCandidateEntities = Math.max(maxCandidateEntities, metrics.candidates);
  maxResidentChunks = Math.max(maxResidentChunks, metrics.chunks);
}
const retainedHeapGrowthMiB = retainedHeap() - before;
const order = [...samples].sort((a, b) => a - b);
const p95Ms = order[Math.ceil(samples.length * 0.95) - 1];
const medianMs = order[Math.ceil(samples.length / 2) - 1];
const finalX = game.getEntity("actor-0")!.transform.x;
const report = {
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    logicalCpuAvailable: availableParallelism(),
  },
  scene: { ...shape, tiles, serializedBytes: Buffer.byteLength(source) },
  timingMs: {
    parse: rounded(parseMs),
    cold: rounded(coldMs),
    median: rounded(medianMs),
    p95: rounded(p95Ms),
    worst: rounded(order.at(-1)!),
  },
  retainedHeapMiB: {
    afterWarmUp: rounded(before),
    growth: rounded(retainedHeapGrowthMiB),
  },
  output: {
    draws,
    digest,
    maxCandidateEntities,
    maxResidentChunks,
    actorTravel: rounded(finalX),
    ticks: Math.round(game.time / STEP),
  },
  limits,
  sceneResidency: qualifySceneResidency(),
};
await mkdir("dist", { recursive: true });
await writeFile(
  "dist/qualification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
assert.equal(report.output.digest, 3413895419, "Legacy draw digest changed.");
assert.equal(report.output.draws, 204503, "Legacy draw count changed.");
assert.equal(report.output.ticks, shape.warmUp + shape.samples);
assert.equal(
  game.logs.length,
  0,
  "The fixture should run without runtime faults.",
);
assert(
  draws > shape.samples * 300,
  "The moving camera should traverse inhabited chunks.",
);
assert(finalX > 10, "Active bodies should advance during the test.");
assert(
  maxCandidateEntities > 0 &&
    maxCandidateEntities <= limits.maxCandidateEntities,
  "Spatial candidate budget exceeded.",
);
assert(
  maxResidentChunks > 0 && maxResidentChunks <= limits.residentChunksPerLayer,
  "Tile chunk budget exceeded.",
);
assert(coldMs <= limits.coldMs, "Cold start budget exceeded.");
assert(p95Ms <= limits.p95Ms, "Simulation and draw-list p95 budget exceeded.");
assert(
  retainedHeapGrowthMiB <= limits.retainedHeapGrowthMiB,
  "Retained heap grew beyond the qualification budget.",
);
