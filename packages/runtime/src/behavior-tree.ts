import { typeOf, type Execution, type Value } from "@mosaic/blueprints";
import {
  behaviorChildren,
  evaluateTreeCondition,
  type BehaviorNode,
  type BehaviorStatus,
  type BehaviorTree,
  type TreeValue,
} from "@mosaic/model";

type Active = {
  cursor?: number;
  deadline?: number;
  repeat?: number;
  execution?: Execution;
};
type Call = (
  node: Extract<BehaviorNode, { kind: "call" }>,
  args: Map<string, Value>,
) => Execution;
export class BehaviorRunner {
  private state = new Map<string, Active>();
  private cooldowns = new Map<string, number>();
  private blackboard: Map<string, Value>;
  private status = new Map<string, BehaviorStatus>();
  private reported = new Set<string>();
  private time = 0;
  private remaining = 0;
  constructor(
    readonly tree: BehaviorTree,
    private call: Call,
    private fault: (id: string, error: unknown) => void,
    previous?: BehaviorRunner,
  ) {
    this.blackboard = new Map(
      tree.blackboard.map(({ id, initial }) => {
        const old = previous?.blackboard.get(id);
        return [
          id,
          old !== undefined && typeOf(old) === typeOf(initial) ? old : initial,
        ];
      }),
    );
  }
  snapshot() {
    return {
      treeId: this.tree.id,
      nodes: Object.fromEntries(this.status),
      blackboard: Object.fromEntries(this.blackboard),
    };
  }
  write(key: string, value: Value) {
    const current = this.blackboard.get(key);
    if (current === undefined || typeOf(current) !== typeOf(value))
      throw new Error("The blackboard key is missing or has a different type.");
    this.blackboard.set(key, value);
  }
  tick(delta: number) {
    this.time += delta;
    this.remaining = 512;
    this.status.clear();
    this.visit(this.tree.root);
  }
  private clear(node: BehaviorNode) {
    this.state.get(node.id)?.execution?.return(undefined);
    this.state.delete(node.id);
    for (const child of behaviorChildren(node)) this.clear(child);
  }
  private value(input: TreeValue) {
    if (input.kind === "value") return input.value;
    const value = this.blackboard.get(input.key);
    if (value === undefined) throw new Error("Blackboard key is missing.");
    return value;
  }
  private visit(node: BehaviorNode): BehaviorStatus {
    if (--this.remaining < 0) return "running";
    const active = this.state.get(node.id) ?? {};
    this.state.set(node.id, active);
    let result: BehaviorStatus;
    try {
      result = this.evaluate(node, active);
    } catch (error) {
      if (!this.reported.has(node.id)) {
        this.reported.add(node.id);
        this.fault(node.id, error);
      }
      result = "failure";
    }
    this.status.set(node.id, result);
    if (result !== "running") this.clear(node);
    return result;
  }
  private evaluate(node: BehaviorNode, active: Active): BehaviorStatus {
    switch (node.kind) {
      case "sequence":
      case "selector": {
        const expected = node.kind === "sequence" ? "success" : "failure";
        let index = active.cursor ?? 0;
        for (; index < node.children.length; index++) {
          const result = this.visit(node.children[index]);
          if (result !== expected) {
            active.cursor = index;
            return result;
          }
        }
        return expected;
      }
      case "condition":
        return evaluateTreeCondition(
          node.operator,
          this.value(node.left),
          this.value(node.right),
        )
          ? "success"
          : "failure";
      case "write":
        this.write(node.key, this.value(node.input));
        return "success";
      case "wait":
        active.deadline ??= this.time + node.seconds;
        return this.time + 1e-10 >= active.deadline ? "success" : "running";
      case "call": {
        if ((active.deadline ?? 0) > this.time) return "running";
        active.execution ??= this.call(
          node,
          new Map(
            Object.entries(node.args).map(([id, input]) => [
              id,
              this.value(input),
            ]),
          ),
        );
        while (this.remaining-- > 0) {
          const next = active.execution.next();
          if (next.done) {
            const value =
              next.value?.kind === "return" ? next.value.value : undefined;
            if (node.result && value !== undefined)
              this.write(node.result, value);
            return value === false ? "failure" : "success";
          }
          if (next.value.kind === "wait") {
            active.deadline = this.time + Math.max(1e-8, next.value.seconds);
            return "running";
          }
        }
        return "running";
      }
      case "decorator": {
        if (
          node.mode === "cooldown" &&
          (this.cooldowns.get(node.id) ?? 0) > this.time
        )
          return "failure";
        if (node.mode === "timeout") {
          active.deadline ??= this.time + node.amount;
          if (this.time >= active.deadline) return "failure";
        }
        const result = this.visit(node.child);
        if (result === "running") return result;
        if (node.mode === "invert")
          return result === "success" ? "failure" : "success";
        if (node.mode === "succeed") return "success";
        if (node.mode === "cooldown")
          this.cooldowns.set(node.id, this.time + node.amount);
        if (node.mode === "repeat" && result === "success") {
          active.repeat = (active.repeat ?? 0) + 1;
          return active.repeat >= node.amount ? "success" : "running";
        }
        return result;
      }
    }
  }
}
