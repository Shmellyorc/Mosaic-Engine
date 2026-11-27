import { parseProject, type Project } from "@mosaic/model";
import { createRenderer, type Preference, type Renderer } from "@mosaic/render";
import {
  AudioMixer,
  browserSlotStorage,
  connectKeyboard,
  Game,
  mountUiStack,
  MAX_SAVE_BYTES,
} from "@mosaic/runtime";

const parent = document.querySelector<HTMLElement>("#game")!;
const control = document.querySelector<HTMLSelectElement>("#backend")!;
const status = document.querySelector<HTMLElement>("#runtime-status")!;
const error = document.querySelector<HTMLElement>("#runtime-error")!;
const report = (message: string) => {
  error.textContent = message;
};

function connectGameData(project: Project, game: Game) {
  const data = project.data;
  if (!data) return;
  const query = <T extends HTMLElement>(id: string) =>
    document.getElementById(id)! as T;
  const menu = query<HTMLDetailsElement>("game-data");
  const languages = query<HTMLSelectElement>("game-language");
  const slots = query<HTMLSelectElement>("game-slot");
  const file = query<HTMLInputElement>("save-file");
  const output = query<HTMLSpanElement>("save-status");
  const saveButton = query<HTMLButtonElement>("save-slot");
  const loadButton = query<HTMLButtonElement>("load-slot");
  for (const tag of data.localization.locales)
    languages.add(new Option(tag, tag));
  for (const slot of data.saves.slots)
    slots.add(new Option(slot.name, slot.id));
  saveButton.disabled = loadButton.disabled = !slots.options.length;
  const update = () => {
    const current = String(game.data.read("locale", ""));
    if (languages.value !== current) languages.value = current;
  };
  const run = (action: () => string) => {
    try {
      output.textContent = action();
      update();
    } catch (failure) {
      output.textContent =
        failure instanceof Error ? failure.message : String(failure);
    }
  };
  languages.addEventListener("change", () =>
    run(() => {
      game.data.setLanguage(languages.value);
      return "Language changed.";
    }),
  );
  saveButton.addEventListener("click", () =>
    run(() => {
      game.data.save(slots.value);
      return "Game saved.";
    }),
  );
  loadButton.addEventListener("click", () =>
    run(() =>
      game.data.load(slots.value) ? "Game loaded." : "That slot is empty.",
    ),
  );
  query("download-save").addEventListener("click", () =>
    run(() => {
      const url = URL.createObjectURL(
        new Blob([game.data.encode()], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "mosaic-game-save.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "Save downloaded.";
    }),
  );
  query("open-save").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const picked = file.files?.[0];
    file.value = "";
    if (!picked) return;
    try {
      if (picked.size > MAX_SAVE_BYTES)
        throw Error("The game save exceeds 1 MiB.");
      const source = await picked.text();
      run(() => {
        game.data.restore(source);
        return "Save imported.";
      });
    } catch (failure) {
      output.textContent =
        failure instanceof Error ? failure.message : String(failure);
    }
  });
  menu.hidden = false;
  update();
  return () => {
    if (menu.open) update();
  };
}

async function boot() {
  const project = parseProject(
    document.querySelector("#mosaic-project")!.textContent ?? "",
  );
  document.title = project.name;
  document.querySelector("#game-title")!.textContent = project.name;
  const game = new Game(
    project,
    project.startSceneId,
    false,
    browserSlotStorage("player"),
  );
  const showData = connectGameData(project, game);
  const sceneLayer = document.createElement("div");
  sceneLayer.style.cssText = "position:absolute;inset:0";
  parent.append(sceneLayer);
  const surface = mountUiStack(parent, {
    width: project.width,
    height: project.height,
    assets: project.assets,
    report,
  });
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
  const detach = connectKeyboard(parent, game.input);
  parent.addEventListener("pointerdown", (event) => {
    if (!(event.target as HTMLElement).closest("[data-ui-control]"))
      parent.focus();
  });
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
      sceneLayer.replaceChildren(mount);
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
    showData?.();
    surface.update(game.uiScreens);
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
    surface.destroy();
    audio.dispose();
    renderer?.dispose();
  });
  await change();
  parent.focus();
  frame = requestAnimationFrame(tick);
}

void boot().catch((failure) => report(String(failure)));
