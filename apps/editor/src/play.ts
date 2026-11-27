import { AudioMixer, browserSlotStorage, Game } from "@mosaic/runtime";
import type { Project } from "@mosaic/model";
import { profileReload, profileSimulation, resetProfile } from "./profiler";
import { selectedScene, useEditor } from "./state";

let game: Game | undefined;
export function playGame() {
  return game;
}

function publishSnapshot(game: Game, entityId: string | null) {
  const pause = game.blueprintPause;
  const focus = pause?.entityId ?? entityId;
  const entity = focus ? game.getEntity(focus) : undefined;
  useEditor.setState({
    snapshot: {
      blocks: [...game.activeBlocks],
      variables: focus
        ? [...(game.getVariables(focus) ?? [])].map(([id, value]) => ({
            id,
            value,
          }))
        : [],
      logs: [...game.logs],
      time: game.time,
      position: entity
        ? { x: entity.transform.x, y: entity.transform.y }
        : undefined,
      pause,
    },
  });
}
function updateBreakpoints(game: Game, entries: Record<string, string[]>) {
  game.setBreakpoints(
    new Map(
      Object.entries(entries).map(([id, blocks]) => [id, new Set(blocks)]),
    ),
  );
}
function showPause(game: Game) {
  const pause = game.blueprintPause;
  if (!pause) return false;
  const current = useEditor.getState();
  if (
    current.transport !== "paused" ||
    pause.blockId !== current.snapshot.pause?.blockId ||
    pause.entityId !== current.snapshot.pause?.entityId
  ) {
    useEditor.setState({
      transport: "paused",
      workspace: "Blueprints",
      entityId: pause.entityId,
      blueprintId: pause.blueprintId,
      eventId: pause.entryId,
      selectedTile: pause.blockId,
    });
    publishSnapshot(game, pause.entityId);
  }
  return true;
}
export function stepBlueprint() {
  const state = useEditor.getState();
  if (!game || state.transport !== "paused" || !state.snapshot.pause) return;
  game.stepBlueprint();
  showPause(game);
  publishSnapshot(game, useEditor.getState().entityId);
}
export function startTransport() {
  const slots = browserSlotStorage("preview");
  let runId = -1;
  let last = performance.now();
  let debugAt = 0;
  let previousEntity: string | null = null;
  let document: Project | undefined;
  const audio = new AudioMixer((message) =>
    useEditor.getState().report(message, "error"),
  );
  useEditor.subscribe((state, previous) => {
    if (
      state.runId !== previous.runId ||
      (state.transport === "editing" && previous.transport !== "editing")
    )
      audio.stopAll();
    if (
      state.transport === "playing" &&
      (state.runId !== previous.runId || previous.transport !== "playing")
    ) {
      audio.configure(state.project.mixer);
      void audio.unlock();
    }
    if (state.transport !== "playing" && previous.transport === "playing")
      audio.pause();
    if (!game || state.runId !== runId) return;
    if (state.breakpoints !== previous.breakpoints)
      updateBreakpoints(game, state.breakpoints);
    if (state.transport === "paused" && previous.transport !== "paused") {
      game.input.clear();
      publishSnapshot(game, state.entityId);
    }
    if (state.transport === "playing" && previous.transport === "paused") {
      game.resumeBlueprints();
      showPause(game);
    }
  });
  function tick(now: number) {
    const state = useEditor.getState();
    if (state.transport !== "editing") {
      if (!game || runId !== state.runId) {
        runId = state.runId;
        document = state.project;
        resetProfile();
        game = new Game(state.project, selectedScene(state).id, true, slots);
        updateBreakpoints(game, state.breakpoints);
        game.start();
        debugAt = 0;
      } else {
        if (state.project !== document) {
          const started = performance.now();
          if (game.reloadProject(state.project)) {
            profileReload(performance.now() - started);
            if (state.project.mixer !== document?.mixer)
              audio.configure(state.project.mixer);
            document = state.project;
            debugAt = 0;
          } else {
            useEditor.getState().stop();
            useEditor.getState().report("The running scene was removed.");
          }
        }
        if (useEditor.getState().transport === "playing") {
          const started = performance.now();
          game.advance((now - last) / 1000);
          profileSimulation(performance.now() - started);
        }
      }
      showPause(game);
      if (
        useEditor.getState().transport === "playing" &&
        state.project.mixer?.sounds.length
      )
        game.consumeAudio((command) => audio.dispatch(command));
      if (now >= debugAt || state.entityId !== previousEntity) {
        debugAt = now + 120;
        previousEntity = state.entityId;
        publishSnapshot(game, useEditor.getState().entityId);
      }
    } else if (game) {
      const logs = [...game.logs];
      game = undefined;
      document = undefined;
      useEditor.setState({
        snapshot: { blocks: [], variables: [], logs, time: 0 },
      });
    }
    last = now;
    requestAnimationFrame(tick);
  }
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) audio.dispose();
  });
  requestAnimationFrame(tick);
}
