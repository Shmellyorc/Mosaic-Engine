import { Game } from "@mosaic/runtime";
import { selectedScene, useEditor } from "./state";

let game: Game | undefined;
export function playGame() {
  return game;
}
export function startTransport() {
  let runId = -1;
  let last = performance.now();
  let debugAt = 0;
  let previousEntity: string | null = null;
  function tick(now: number) {
    const state = useEditor.getState();
    if (state.transport !== "editing") {
      if (!game || runId !== state.runId) {
        runId = state.runId;
        game = new Game(state.project, selectedScene(state).id, true);
        game.start();
        debugAt = 0;
      } else if (state.transport === "playing")
        game.advance((now - last) / 1000);
      if (now >= debugAt || state.entityId !== previousEntity) {
        debugAt = now + 120;
        previousEntity = state.entityId;
        const entity = state.entityId
          ? game.getEntity(state.entityId)
          : undefined;
        useEditor.setState({
          snapshot: {
            blocks: [...game.activeBlocks],
            variables: state.entityId
              ? [...(game.getVariables(state.entityId) ?? [])].map(
                  ([id, value]) => ({ id, value }),
                )
              : [],
            logs: [...game.logs],
            time: game.time,
            position: entity
              ? { x: entity.transform.x, y: entity.transform.y }
              : undefined,
          },
        });
      }
    } else if (game) {
      const logs = [...game.logs];
      game = undefined;
      useEditor.setState({
        snapshot: { blocks: [], variables: [], logs, time: 0 },
      });
    }
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
