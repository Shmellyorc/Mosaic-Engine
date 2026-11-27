import { parseProject } from "@mosaic/model";
import { createRenderer, type Preference, type Renderer } from "@mosaic/render";
import { AudioMixer, connectKeyboard, Game } from "@mosaic/runtime";

const parent = document.querySelector<HTMLElement>("#game")!;
const control = document.querySelector<HTMLSelectElement>("#backend")!;
const status = document.querySelector<HTMLElement>("#runtime-status")!;
const error = document.querySelector<HTMLElement>("#runtime-error")!;
const report = (message: string) => {
  error.textContent = message;
};

async function boot() {
  const project = parseProject(
    document.querySelector("#mosaic-project")!.textContent ?? "",
  );
  document.title = project.name;
  document.querySelector("#game-title")!.textContent = project.name;
  const game = new Game(project);
  const audio = new AudioMixer(report);
  const audioButton =
    document.querySelector<HTMLButtonElement>("#enable-audio")!;
  audio.configure(project.mixer);
  let audioReady = false;
  if (project.mixer?.sounds.length) {
    audioButton.hidden = false;
    audioButton.addEventListener("click", async () => {
      audioReady = await audio.unlock();
      audioButton.hidden = audioReady;
      parent.focus();
    });
  }
  const detach = connectKeyboard(window, game.input);
  let renderer: Renderer | undefined;
  let loading = false;
  let request = 0;
  let frame = 0;
  let last = performance.now();
  let lastError: string | undefined;
  function draw() {
    const bounds = parent.getBoundingClientRect();
    renderer?.resize(bounds.width, bounds.height);
    renderer?.render(game.frame());
  }
  async function change() {
    const current = ++request;
    const mount = document.createElement("div");
    mount.style.cssText = "position:absolute;inset:0";
    loading = true;
    error.textContent = "";
    try {
      const next = await createRenderer(
        { parent: mount, assets: project.assets, report },
        control.value as Preference,
        (backend) => {
          if (current === request)
            status.textContent =
              backend === "pixi" ? "PixiJS accelerated" : "Canvas 2D";
        },
      );
      if (current !== request) {
        next.dispose();
        return;
      }
      renderer?.dispose();
      renderer = next;
      parent.replaceChildren(mount);
      draw();
    } catch (failure) {
      report(String(failure));
    } finally {
      if (current === request) loading = false;
    }
  }
  function tick(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    if (!loading) game.advance(dt);
    if (audioReady) game.consumeAudio((command) => audio.dispatch(command));
    const failure = game.logs.findLast(
      (entry) => entry.level === "error",
    )?.message;
    if (failure && failure !== lastError) {
      lastError = failure;
      report(failure);
    }
    try {
      draw();
    } catch (failure) {
      report(String(failure));
      renderer?.dispose();
      renderer = undefined;
    }
    frame = requestAnimationFrame(tick);
  }
  control.addEventListener("change", () => {
    void change();
    parent.focus();
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    request++;
    cancelAnimationFrame(frame);
    detach();
    audio.dispose();
    renderer?.dispose();
  });
  await change();
  parent.focus();
  frame = requestAnimationFrame(tick);
}

void boot().catch((failure) => report(String(failure)));
