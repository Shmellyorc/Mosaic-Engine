import { compileBlueprint } from "@mosaic/blueprints";
import {
  MAX_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_SOUND_BYTES,
  MASTER_BUS,
  createMixer,
  inspectWav,
  newId,
  parseProject,
  serializeProject,
  type Project,
} from "@mosaic/model";
import { gameHtml } from "../../game/src/html";
import type { ImportedAsset } from "../../desktop/src/contracts";
import { useEditor } from "./state";

type PickerType = { description: string; accept: Record<string, string[]> };
type BrowserPicker = Window & {
  showOpenFilePicker?: (options: {
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};
const picker = window as BrowserPicker;
let browserProject: FileSystemFileHandle | undefined;
let browserProjectId: string | undefined;
const projectType = {
  description: "Mosaic project",
  accept: { "application/json": [".json"] },
};
const gameType = {
  description: "Standalone web game",
  accept: { "text/html": [".html"] },
};
const images = {
  description: "Sprite image",
  accept: {
    "image/png": [".png"],
    "image/jpeg": [".jpeg", ".jpg"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
  },
};
export const interrupted = (failure: unknown) =>
  failure instanceof DOMException && failure.name === "AbortError";

function fallbackOpen(accept: string) {
  return new Promise<File | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}
async function openFile(type: PickerType, fallback: string) {
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({ types: [type] });
      return { file: await handle.getFile(), handle };
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "SecurityError")
        throw error;
    }
  }
  const file = await fallbackOpen(fallback);
  return file ? { file, handle: undefined } : undefined;
}
async function writeFile(
  contents: string,
  filename: string,
  type: PickerType,
  handle?: FileSystemFileHandle,
) {
  if (!handle && picker.showSaveFilePicker) {
    try {
      handle = await picker.showSaveFilePicker({
        suggestedName: filename,
        types: [type],
      });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "SecurityError")
        throw error;
    }
  }
  if (handle) {
    const file = await handle.createWritable();
    try {
      await file.write(contents);
      await file.close();
    } catch (error) {
      await file.abort().catch(() => undefined);
      throw error;
    }
    return handle;
  }
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(
    new Blob([contents], { type: Object.keys(type.accept)[0] }),
  );
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export function resetProjectHandle() {
  browserProject = undefined;
  browserProjectId = undefined;
}
export async function openProject() {
  const state = useEditor.getState();
  if (window.mosaic) {
    const result = await window.mosaic.openProject();
    if (result) state.load(parseProject(result.source), result);
    return Boolean(result);
  }
  const result = await openFile(projectType, ".json");
  if (!result) return false;
  if (result.file.size > MAX_PROJECT_BYTES)
    throw new Error("Project exceeds the 64 MiB format limit.");
  const project = parseProject(await result.file.text());
  browserProject = result.handle;
  browserProjectId = project.id;
  state.load(project);
  return true;
}
function slug(project: Project) {
  return (
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "mosaic-game"
  );
}
export async function saveProject(as = false) {
  const state = useEditor.getState();
  const source = serializeProject(state.project);
  if (window.mosaic) {
    const location = await window.mosaic.saveProject(
      source,
      as ? undefined : state.location?.token,
    );
    if (!location) return false;
    state.save(state.project, location);
  } else {
    browserProject = await writeFile(
      source,
      `${slug(state.project)}.mosaic.json`,
      projectType,
      as || browserProjectId !== state.project.id ? undefined : browserProject,
    );
    browserProjectId = state.project.id;
    state.save(state.project);
  }
  return true;
}
export async function importImage() {
  let selected: ImportedAsset | null;
  if (window.mosaic) selected = await window.mosaic.importImage();
  else {
    const result = await openFile(images, ".png,.jpg,.jpeg,.gif,.webp");
    if (!result) return false;
    const file = result.file;
    if (!Object.keys(images.accept).includes(file.type))
      throw new Error("Choose a PNG, JPEG, WebP or GIF file.");
    if (file.size > MAX_IMAGE_BYTES)
      throw new Error("Image exceeds the 8 MiB asset limit.");
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    selected = { name: file.name.slice(0, 100), source };
  }
  if (!selected) return false;
  const image = new Image();
  image.src = selected.source;
  try {
    await image.decode();
  } catch {
    throw new Error(`Could not decode "${selected.name}".`);
  }
  if (image.naturalWidth > 8192 || image.naturalHeight > 8192)
    throw new Error("Image exceeds the 8192 pixel texture limit.");
  const asset = { ...selected, id: newId() };
  useEditor.getState().edit((project) => {
    project.assets.push(asset);
  });
  return true;
}
export async function importSound() {
  const initial = useEditor.getState().project;
  let selected: ImportedAsset | null;
  if (window.mosaic) selected = await window.mosaic.importSound();
  else {
    const result = await openFile(
      { description: "WAV audio", accept: { "audio/wav": [".wav"] } },
      ".wav",
    );
    if (!result) return;
    const { file } = result;
    if (file.size > MAX_SOUND_BYTES)
      throw new Error("Sound exceeds the 8 MiB asset limit.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    inspectWav(bytes);
    let binary = "";
    for (let start = 0; start < bytes.length; start += 0x2000)
      binary += String.fromCharCode(...bytes.subarray(start, start + 0x2000));
    selected = {
      name: file.name.slice(0, 100),
      source: "data:audio/wav;base64," + btoa(binary),
    };
  }
  if (!selected) return;
  const state = useEditor.getState();
  if (initial.id !== state.project.id) return;
  if ((state.project.mixer?.sounds.length ?? 0) >= 128)
    throw new Error("This project already has 128 sounds.");
  const sound = {
    ...selected,
    id: newId(),
    bus: MASTER_BUS,
    gain: 1,
    loop: false,
  };
  state.edit((project) => {
    (project.mixer ??= createMixer()).sounds.push(sound);
  });
  return sound.id;
}
export async function exportGame() {
  const project = useEditor.getState().project;
  const axes = new Set(project.input.map((axis) => axis.id));
  const assigned = new Set(
    project.scenes.flatMap((scene) =>
      scene.entities.map((entity) => entity.blueprintId),
    ),
  );
  for (const blueprint of project.blueprints) {
    if (!assigned.has(blueprint.id)) continue;
    const [diagnostic] = compileBlueprint(
      blueprint,
      axes,
      project.signals,
    ).diagnostics;
    if (diagnostic)
      throw new Error(
        `${blueprint.name} (${diagnostic.blockId}) — ${diagnostic.message}`,
      );
  }
  const filename = `${slug(project)}.html`;
  if (window.mosaic)
    return window.mosaic.exportGame(serializeProject(project), filename);
  const runtime = (await import("virtual:mosaic-game")).default;
  await writeFile(gameHtml(project, runtime), filename, gameType);
  return true;
}
