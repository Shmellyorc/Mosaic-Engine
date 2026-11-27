import {
  inspectWav,
  type Asset,
  type Frame,
  type Project,
} from "@mosaic/model";
import { autotileFrame } from "@mosaic/runtime";

export async function imageDimensions(asset: Pick<Asset, "name" | "source">) {
  const image = new Image();
  image.src = asset.source;
  try {
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width > 8192 || height > 8192)
      throw new Error(`"${asset.name}" exceeds the 8192 pixel texture limit.`);
    return { width, height };
  } catch (error) {
    if (error instanceof DOMException)
      throw new Error(`Could not decode "${asset.name}".`);
    throw error;
  } finally {
    image.removeAttribute("src");
  }
}

const yieldToBrowser = () => new Promise<void>((done) => setTimeout(done, 0));

export async function auditAssets(project: Project) {
  const issues: string[] = [];
  let issueCount = 0;
  const issue = (message: string) => {
    issueCount++;
    if (issues.length < 100) issues.push(message);
  };
  const dimensions = new Map<string, { width: number; height: number }>();
  const known = new Set(project.assets.map((asset) => asset.id));
  let next = 0;
  async function decode() {
    while (next < project.assets.length) {
      const asset = project.assets[next++];
      try {
        dimensions.set(asset.id, await imageDimensions(asset));
      } catch (failure) {
        issue(String(failure instanceof Error ? failure.message : failure));
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, project.assets.length) }, decode),
  );
  const sounds = project.mixer?.sounds ?? [];
  for (const sound of sounds) {
    await yieldToBrowser();
    try {
      const encoded = atob(sound.source.slice(sound.source.indexOf(",") + 1));
      inspectWav(Uint8Array.from(encoded, (byte) => byte.charCodeAt(0)));
    } catch (failure) {
      issue(
        `Sound "${sound.name}" is invalid. ${failure instanceof Error ? failure.message : failure}`,
      );
    }
  }
  function bounds(label: string, id: string, frames: readonly Frame[]) {
    if (!known.has(id)) {
      issue(`${label} references a missing image.`);
      return;
    }
    const size = dimensions.get(id);
    if (!size) return;
    const invalid = frames.findIndex(
      ({ x, y, w, h }) =>
        x < 0 || y < 0 || x + w > size.width || y + h > size.height,
    );
    if (invalid !== -1)
      issue(
        `${label}, frame ${invalid + 1}, falls outside its ${size.width} × ${size.height} image.`,
      );
  }
  let visited = 0;
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      if (++visited % 256 === 0) await yieldToBrowser();
      if (entity.visual?.kind !== "sprite") continue;
      const { assetId, frame } = entity.visual;
      const label = `${scene.name} / ${entity.name}`;
      bounds(label, assetId, frame ? [frame] : []);
      for (const clip of entity.clips)
        bounds(`${label} / ${clip.name}`, assetId, clip.frames);
    }
    for (const { name, atlas } of scene.tilemap.terrains ?? [])
      if (atlas)
        bounds(
          `${scene.name} / ${name}`,
          atlas.assetId,
          Array.from({ length: 16 }, (_, mask) => autotileFrame(atlas, mask)),
        );
    for (const widget of scene.ui?.widgets ?? [])
      if (widget.image)
        bounds(`${scene.name} / ${widget.name}`, widget.image, []);
  }
  return {
    issues,
    issueCount,
    images: project.assets.length,
    sounds: sounds.length,
  };
}
