import "pixi.js/unsafe-eval";
import {
  Application,
  Color,
  Container,
  Graphics,
  Matrix,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { fitFrame, type Draw } from "@mosaic/runtime";
import { createLightmap } from "./lightmap";
import { imageStream } from "./cache";
import {
  insideImage,
  reportFrames,
  type Renderer,
  type RendererOptions,
} from "./index";

export async function createPixi(
  options: RendererOptions,
  lost: () => void,
): Promise<Renderer> {
  const app = new Application();
  const canvas = document.createElement("canvas");
  try {
    await app.init({
      canvas,
      width: 1,
      height: 1,
      autoStart: false,
      preference: ["webgl", "webgpu"],
      background: "#0e101b",
      antialias: false,
      eventFeatures: {
        move: false,
        click: false,
        wheel: false,
        globalMove: false,
      },
    });
  } catch (error) {
    if (app.renderer) app.destroy();
    throw error;
  }
  options.parent.replaceChildren(canvas);
  const onLoss = (event: Event) => {
    event.preventDefault();
    lost();
  };
  canvas.addEventListener("webglcontextlost", onLoss);
  if ("gpu" in app.renderer) {
    const webgpu = app.renderer.gpu as { device?: { lost: Promise<unknown> } };
    void webgpu.device?.lost.then(lost);
  }
  const view = new Container();
  const background = new Graphics();
  const mask = new Graphics();
  app.stage.addChild(view, mask);
  view.addChild(background);
  view.mask = mask;
  const badFrame = reportFrames(options.report);
  const textures = new Map<string, Texture>();
  const frames = new Map<string, Map<string, Texture>>();
  const resources = imageStream(options.assets, options.report, (id) => {
    for (const texture of frames.get(id)?.values() ?? [])
      texture.destroy(false);
    frames.delete(id);
    textures.get(id)?.destroy(true);
    textures.delete(id);
  });
  const slots: { node: Sprite | Text; kind: "image" | "text" }[] = [];
  const matrix = new Matrix();
  const tint = new Color();
  let maskKey = "";
  let bgKey = "";
  let lightmap: ReturnType<typeof createLightmap> | undefined;
  let light: Sprite | undefined;
  let lightWidth = 0,
    lightHeight = 0;
  function spriteTexture(draw: Extract<Draw, { kind: "sprite" }>) {
    const image = resources.get(draw.assetId);
    if (!image) return null;
    if (draw.frame && !insideImage(draw.frame, image)) {
      badFrame(draw.assetId);
      return null;
    }
    let texture = textures.get(draw.assetId);
    if (!texture) {
      texture = Texture.from(image, true);
      texture.source.scaleMode = "nearest";
      textures.set(draw.assetId, texture);
    }
    if (!draw.frame) return texture;
    const { x, y, w, h } = draw.frame;
    const key = `${x},${y},${w},${h}`;
    let atlas = frames.get(draw.assetId);
    if (!atlas) {
      atlas = new Map();
      frames.set(draw.assetId, atlas);
    }
    let subtexture = atlas.get(key);
    if (subtexture) atlas.delete(key);
    if (!subtexture) {
      subtexture = new Texture({
        source: texture.source,
        frame: new Rectangle(x, y, w, h),
      });
    }
    atlas.set(key, subtexture);
    return subtexture;
  }
  return {
    backend: "pixi",
    updateAssets: resources.replace,
    metrics: resources.metrics,
    resize(width, height) {
      app.renderer.resize(width, height);
    },
    render(frame) {
      resources.prepare(frame.draws);
      const layout = fitFrame(
        frame.width,
        frame.height,
        app.screen.width,
        app.screen.height,
      );
      const clipKey = [
        layout.x,
        layout.y,
        layout.scale,
        frame.width,
        frame.height,
      ].join(",");
      if (clipKey !== maskKey) {
        maskKey = clipKey;
        mask
          .clear()
          .rect(
            layout.x,
            layout.y,
            frame.width * layout.scale,
            frame.height * layout.scale,
          )
          .fill(0xffffff);
      }
      const fill = [frame.width, frame.height, frame.background].join(",");
      if (fill !== bgKey) {
        bgKey = fill;
        background
          .clear()
          .rect(0, 0, frame.width, frame.height)
          .fill(frame.background);
      }
      view.position.set(layout.x, layout.y);
      view.scale.set(layout.scale);
      light?.removeFromParent();
      frame.draws.forEach((draw, index) => {
        let slot = slots[index];
        const kind = draw.kind === "text" ? "text" : "image";
        if (!slot || slot.kind !== kind) {
          slot?.node.destroy();
          const node =
            kind === "text"
              ? new Text({
                  style: { fontFamily: "sans-serif", fontWeight: "600" },
                })
              : new Sprite(Texture.WHITE);
          slot = { node, kind };
          slots[index] = slot;
          view.addChildAt(node, index + 1);
        }
        slot.node.visible = true;
        slot.node.alpha = draw.alpha;
        const { a, b, c, d, x, y } = draw.matrix;
        if (draw.kind === "text" && slot.node instanceof Text) {
          slot.node.text = draw.text;
          slot.node.style.fill = draw.color;
          slot.node.style.fontSize = draw.size;
          slot.node.setFromMatrix(matrix.set(a, b, c, d, x, y));
        } else if (draw.kind !== "text" && slot.node instanceof Sprite) {
          const texture = draw.kind === "sprite" ? spriteTexture(draw) : null;
          slot.node.texture = texture ?? Texture.WHITE;
          slot.node.tint = tint
            .setValue(
              draw.kind === "rect"
                ? draw.color
                : texture
                  ? "#ffffff"
                  : "#b14f9e",
            )
            .toNumber();
          const sx = draw.width / slot.node.texture.orig.width;
          const sy = draw.height / slot.node.texture.orig.height;
          slot.node.setFromMatrix(
            matrix.set(a * sx, b * sx, c * sy, d * sy, x, y),
          );
        }
      });
      for (let i = frame.draws.length; i < slots.length; i++)
        slots[i].node.visible = false;
      if (slots.length > Math.max(512, frame.draws.length * 2)) {
        for (const slot of slots.splice(frame.draws.length))
          slot.node.destroy();
      }
      if (frame.lighting) {
        lightmap ??= createLightmap();
        const changed = lightmap.draw(
          frame.width,
          frame.height,
          frame.lighting,
        );
        const { canvas } = lightmap;
        if (
          !light ||
          canvas.width !== lightWidth ||
          canvas.height !== lightHeight
        ) {
          light?.destroy({ texture: true, textureSource: true });
          light = new Sprite(Texture.from(canvas, true));
          light.blendMode = "multiply";
          lightWidth = canvas.width;
          lightHeight = canvas.height;
        } else if (changed) light.texture.source.update();
        light.width = frame.width;
        light.height = frame.height;
        view.addChildAt(light, frame.lighting.worldDraws + 1);
      }
      app.render();
      for (const atlas of frames.values()) {
        if (atlas.size <= 512) continue;
        for (const [key, frame] of atlas) {
          if (atlas.size <= 512) break;
          frame.destroy(false);
          atlas.delete(key);
        }
      }
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLoss);
      light?.removeFromParent();
      light?.destroy({ texture: true, textureSource: true });
      app.destroy({ removeView: true }, { children: true });
      resources.dispose();
    },
  };
}
