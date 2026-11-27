import type { Asset } from "@mosaic/model";
import type { Draw } from "@mosaic/runtime";

type ImageRecord = { image: HTMLImageElement; bytes: number };
export type ImageMetrics = {
  resident: number;
  decoding: number;
  requested: number;
  bytes: number;
  evicted: number;
};
const CACHE_BYTES = 256 * 1024 * 1024;
const CACHE_IMAGES = 96;
const CONCURRENT = 4;

export function imageStream(
  assets: Asset[],
  report: (message: string) => void,
  evict: (id: string) => void = () => {},
  limits = { bytes: CACHE_BYTES, count: CACHE_IMAGES, concurrent: CONCURRENT },
) {
  let catalog = new Map(assets.map((asset) => [asset.id, asset]));
  const resident = new Map<string, ImageRecord>();
  const pending = new Map<string, HTMLImageElement>();
  const wanted = new Set<string>();
  const demand = new Set<string>();
  const failed = new Set<string>();
  const blocked = new Set<string>();
  let bytes = 0;
  let evicted = 0;
  let disposed = false;

  function drop(id: string) {
    const entry = resident.get(id);
    if (!entry) return;
    resident.delete(id);
    bytes -= entry.bytes;
    entry.image.removeAttribute("src");
    evicted++;
    evict(id);
  }
  function cancel(id: string, image: HTMLImageElement) {
    pending.delete(id);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
  }
  function schedule() {
    if (disposed) return;
    for (const id of wanted) {
      if (pending.size >= limits.concurrent) break;
      if (
        resident.has(id) ||
        pending.has(id) ||
        failed.has(id) ||
        blocked.has(id)
      )
        continue;
      const asset = catalog.get(id);
      if (!asset) continue;
      const image = new Image();
      pending.set(id, image);
      image.onload = () => {
        if (disposed || pending.get(id) !== image) return;
        pending.delete(id);
        const { naturalWidth: width, naturalHeight: height } = image;
        const size = width * height * 4;
        if (width > 8192 || height > 8192 || size > limits.bytes) {
          failed.add(id);
          report(`"${asset.name}" exceeds the texture size budget.`);
          schedule();
          return;
        }
        for (const key of resident.keys()) {
          if (resident.size < limits.count && bytes + size <= limits.bytes)
            break;
          if (!wanted.has(key)) drop(key);
        }
        if (resident.size < limits.count && bytes + size <= limits.bytes) {
          resident.set(id, { image, bytes: size });
          bytes += size;
        } else {
          blocked.add(id);
          image.removeAttribute("src");
        }
        schedule();
      };
      image.onerror = () => {
        if (disposed || pending.get(id) !== image) return;
        pending.delete(id);
        failed.add(id);
        report(`Could not decode "${asset.name}".`);
        schedule();
      };
      image.src = asset.source;
    }
  }
  return {
    prepare(draws: readonly Draw[]) {
      demand.clear();
      for (const draw of draws)
        if (draw.kind === "sprite") demand.add(draw.assetId);
      let unchanged = demand.size === wanted.size;
      if (unchanged)
        for (const id of demand) {
          if (wanted.has(id)) continue;
          unchanged = false;
          break;
        }
      if (unchanged) return;
      wanted.clear();
      for (const id of demand) wanted.add(id);
      blocked.clear();
      for (const [id, image] of pending) if (!wanted.has(id)) cancel(id, image);
      for (const id of wanted) {
        const record = resident.get(id);
        if (record) {
          resident.delete(id);
          resident.set(id, record);
        }
      }
      schedule();
    },
    get(id: string) {
      return resident.get(id)?.image;
    },
    replace(next: Asset[]) {
      const updated = new Map(next.map((asset) => [asset.id, asset]));
      for (const [id, asset] of catalog) {
        if (asset.source === updated.get(id)?.source) continue;
        drop(id);
        const image = pending.get(id);
        if (image) cancel(id, image);
        failed.delete(id);
      }
      catalog = updated;
      blocked.clear();
      schedule();
    },
    metrics(): ImageMetrics {
      return {
        resident: resident.size,
        decoding: pending.size,
        requested: wanted.size,
        bytes,
        evicted,
      };
    },
    dispose() {
      disposed = true;
      for (const [id, image] of pending) cancel(id, image);
      for (const id of resident.keys()) drop(id);
      wanted.clear();
      demand.clear();
      failed.clear();
      blocked.clear();
    },
  };
}
