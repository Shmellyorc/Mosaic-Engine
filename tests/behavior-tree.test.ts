import { expect, test } from "vitest";
import { literal } from "@mosaic/blueprints";
import {
  capturePrefab,
  createEntity,
  createProject,
  instantiatePrefab,
  parseProject,
  serializeProject,
  type BehaviorTree,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";

test("runs independent prefab Behavior Trees with running branches, typed function calls and debug state", () => {
  const project = createProject();
  const scene = project.scenes[0];
  const first = createEntity(scene.layers[0].id, "First");
  first.behaviorTree = "patrol";
  scene.entities.push(first);
  project.blueprints.push({
    id: "actions",
    name: "Actions",
    version: 2,
    variables: [],
    events: [],
    functions: [
      {
        id: "translate",
        name: "Translate",
        parameters: [{ id: "where", name: "Where", type: "number" }],
        returns: "boolean",
        blocks: [
          { id: "delay", kind: "wait", seconds: literal(STEP) },
          {
            id: "move",
            kind: "property",
            property: "x",
            value: { kind: "variable", id: "where" },
          },
          { id: "result", kind: "return", value: literal(true) },
        ],
      },
    ],
  });
  const tree: BehaviorTree = {
    id: "patrol",
    name: "Patrol",
    blackboard: [
      { id: "enabled", name: "Enabled", initial: false },
      { id: "target", name: "Target", initial: 32 },
      { id: "arrived", name: "Arrived", initial: false },
    ],
    root: {
      id: "root",
      kind: "selector",
      name: "Patrol",
      children: [
        {
          id: "branch",
          kind: "sequence",
          name: "Go",
          children: [
            {
              id: "active",
              name: "Is active",
              kind: "condition",
              operator: "==",
              left: { kind: "key", key: "enabled" },
              right: { kind: "value", value: true },
            },
            {
              id: "call",
              name: "Move",
              kind: "call",
              blueprintId: "actions",
              functionId: "translate",
              args: { where: { kind: "key", key: "target" } },
              result: "arrived",
            },
          ],
        },
        {
          id: "fallback",
          kind: "decorator",
          name: "Rest",
          mode: "succeed",
          amount: 0,
          child: {
            id: "wait",
            name: "Rest a beat",
            kind: "wait",
            seconds: STEP,
          },
        },
      ],
    },
  };
  project.behaviorTrees = [tree];
  const prefab = capturePrefab(scene, first.id);
  project.prefabs = [prefab];
  const second = instantiatePrefab(prefab, scene, {
    x: 80,
    y: 0,
  })[0];
  scene.entities.push(second);
  const game = new Game(parseProject(serializeProject(project)));
  game.writeBlackboard(first.id, "enabled", true);
  game.writeBlackboard(first.id, "target", 112);
  game.advance(STEP);
  expect(game.getBehaviorTree(first.id)?.nodes).toMatchObject({
    root: "running",
    call: "running",
  });
  expect(game.getBehaviorTree(second.id)?.nodes).toMatchObject({
    active: "failure",
    wait: "running",
  });
  game.advance(STEP);
  expect(game.getBehaviorTree(first.id)?.blackboard.arrived).toBe(true);
  expect(game.getEntity(first.id)?.transform.x).toBe(112);
  expect(game.getEntity(second.id)?.transform.x).toBe(80);
  expect(() => game.writeBlackboard(first.id, "target", true)).toThrow(/type/);
});

test("rejects incompatible Blueprint functions and duplicate node IDs during save", () => {
  const project = createProject();
  project.behaviorTrees = [
    {
      id: "tree",
      name: "Broken",
      blackboard: [],
      root: {
        id: "root",
        name: "Root",
        kind: "call",
        blueprintId: "missing",
        functionId: "unknown",
        args: {},
      },
    },
  ];
  expect(() => serializeProject(project)).toThrow(/missing Blueprint function/);
  project.behaviorTrees[0].root = {
    id: "root",
    name: "Root",
    kind: "sequence",
    children: [{ id: "root", name: "Duplicate", kind: "wait", seconds: 1 }],
  };
  expect(() => serializeProject(project)).toThrow(/duplicate node IDs/);
});
