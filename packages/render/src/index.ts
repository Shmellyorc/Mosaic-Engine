import type { Asset, Frame } from "@mosaic/model";
import { fitFrame, type RenderFrame } from "@mosaic/runtime";

export type Backend = "canvas" | "pixi";
export type Preference = Backend | "auto";
export type Renderer = {
  readonly backend: Backend;
  resize(width: number, height: number): void;
  render(frame: RenderFrame): void;
  dispose(): void;
};
export type RendererOptions = {
  parent: HTMLElement;
  assets: Asset[];
  report(message: string): void;
};
type PixiFactory = (
  options: RendererOptions,
  lost: () => void,
) => Promise<Renderer>;

export function assetImages(
  assets: Asset[],
  report: RendererOptions["report"],
) {
  const images = new Map<string, HTMLImageElement>();
  const pending = new Map<string, HTMLImageElement>();
  let disposed = false;
  for (const asset of assets) {
    const image = new Image();
    pending.set(asset.id, image);
    image.onload = () => {
      if (disposed) return;
      pending.delete(asset.id);
      if (image.naturalWidth > 8192 || image.naturalHeight > 8192)
        report(`"${asset.name}" exceeds the 8192 pixel texture limit.`);
      else images.set(asset.id, image);
    };
    image.onerror = () => {
      pending.delete(asset.id);
      if (!disposed) report(`Could not decode "${asset.name}".`);
    };
    image.src = asset.source;
  }
  return {
    images,
    dispose() {
      disposed = true;
      for (const image of pending.values()) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
      pending.clear();
      images.clear();
    },
  };
}
export function insideImage(frame: Frame, image: HTMLImageElement) {
  return (
    frame.x + frame.w <= image.naturalWidth &&
    frame.y + frame.h <= image.naturalHeight
  );
}
export function reportFrames(report: RendererOptions["report"]) {
  const reported = new Set<string>();
  return (id: string) => {
    if (!reported.has(id)) {
      reported.add(id);
      report(`Sprite frame is outside image "${id}".`);
    }
  };
}

export function createCanvas(options: RendererOptions): Renderer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  options.parent.replaceChildren(canvas);
  const resources = assetImages(options.assets, options.report);
  const badFrame = reportFrames(options.report);
  return {
    backend: "canvas",
    resize(width, height) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    },
    render(frame) {
      const view = fitFrame(
        frame.width,
        frame.height,
        canvas.width,
        canvas.height,
      );
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0e101b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
      ctx.beginPath();
      ctx.rect(0, 0, frame.width, frame.height);
      ctx.clip();
      ctx.fillStyle = frame.background;
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.imageSmoothingEnabled = false;
      for (const draw of frame.draws) {
        const { a, b, c, d, x, y } = draw.matrix;
        ctx.setTransform(
          a * view.scale,
          b * view.scale,
          c * view.scale,
          d * view.scale,
          x * view.scale + view.x,
          y * view.scale + view.y,
        );
        ctx.globalAlpha = draw.alpha;
        if (draw.kind === "text") {
          ctx.font = `600 ${draw.size}px sans-serif`;
          ctx.textBaseline = "top";
          ctx.fillStyle = draw.color;
          ctx.fillText(draw.text, 0, 0);
        } else if (draw.kind === "sprite") {
          const image = resources.images.get(draw.assetId);
          if (image && (!draw.frame || insideImage(draw.frame, image))) {
            if (draw.frame) {
              const { x, y, w, h } = draw.frame;
              ctx.drawImage(image, x, y, w, h, 0, 0, draw.width, draw.height);
            } else ctx.drawImage(image, 0, 0, draw.width, draw.height);
          } else {
            if (image) badFrame(draw.assetId);
            ctx.fillStyle = "#b14f9e";
            ctx.fillRect(0, 0, draw.width, draw.height);
          }
        } else {
          ctx.fillStyle = draw.color;
          ctx.fillRect(0, 0, draw.width, draw.height);
        }
      }
      ctx.restore();
    },
    dispose() {
      resources.dispose();
      canvas.remove();
    },
  };
}

export function rendererFactories(pixi: PixiFactory, canvas = createCanvas) {
  return async (
    options: RendererOptions,
    preference: Preference,
    changed: (backend: Backend) => void,
  ): Promise<Renderer> => {
    let current: Renderer;
    let closed = false;
    let width = 1;
    let height = 1;
    let last: RenderFrame | undefined;
    const fallback = (reason: string) => {
      options.report(reason);
      const replacement = canvas(options);
      current?.dispose();
      current = replacement;
      current.resize(width, height);
      if (last) current.render(last);
      changed("canvas");
    };
    if (preference === "canvas") {
      current = canvas(options);
      changed("canvas");
    } else {
      let lostOnInit = false;
      try {
        current = await pixi(options, () => {
          if (!current) {
            lostOnInit = true;
            return;
          }
          if (!closed && current.backend === "pixi")
            fallback("Accelerated rendering was lost. Switched to Canvas 2D.");
        });
        if (lostOnInit)
          fallback(
            "Accelerated rendering was lost during startup. Switched to Canvas 2D.",
          );
        else changed("pixi");
      } catch (error) {
        fallback(
          `Accelerated rendering unavailable. Using Canvas 2D. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return {
      get backend() {
        return current.backend;
      },
      resize(w, h) {
        width = Math.max(1, Math.round(w));
        height = Math.max(1, Math.round(h));
        current.resize(width, height);
      },
      render(frame) {
        last = frame;
        try {
          current.render(frame);
        } catch (error) {
          if (current.backend === "canvas") throw error;
          fallback(
            `Accelerated rendering failed. ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      dispose() {
        closed = true;
        last = undefined;
        current.dispose();
      },
    };
  };
}
export const createRenderer = rendererFactories(async (options, lost) =>
  (await import("./pixi")).createPixi(options, lost),
);
