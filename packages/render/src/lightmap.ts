import type { LightingPass } from "@mosaic/runtime";

const MAX_LIGHTMAP_SIDE = 1024;

export function createLightmap() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the lightmap surface.");
  let last = "";
  return {
    canvas,
    draw(width: number, height: number, pass: LightingPass) {
      const key = JSON.stringify([width, height, pass.ambient, pass.lights]);
      if (key === last) return false;
      last = key;
      const scale = Math.min(0.5, MAX_LIGHTMAP_SIDE / Math.max(width, height));
      const w = Math.max(1, Math.ceil(width * scale));
      const h = Math.max(1, Math.ceil(height * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      context.setTransform(w / width, 0, 0, h / height, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = pass.ambient;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const light of pass.lights) {
        const { x, y, radius, color, intensity } = light;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(
          0,
          color +
            Math.round(intensity * 255)
              .toString(16)
              .padStart(2, "0"),
        );
        gradient.addColorStop(1, color + "00");
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      return true;
    },
  };
}
