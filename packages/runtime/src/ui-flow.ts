import {
  resolveUiStyle,
  type UiAction,
  type UiFlow,
  type UiScreen,
  type UiSkin,
} from "@mosaic/model";
import { UiWorld } from "./ui";
import type { GameData } from "./data";
import type { Value } from "@mosaic/blueprints";

type Instance = {
  key: string;
  id: string;
  owner: string | null;
  layer: string;
  order: number;
  world: UiWorld;
  asset: UiScreen;
  focus?: boolean;
  shown: number;
  closing?: boolean;
};
export type UiScreenView = {
  key: string;
  id?: string;
  world: UiWorld;
  active: boolean;
  block: boolean;
  modal?: boolean;
  focus?: boolean;
  opacity: number;
  skinVersion?: number;
  skin?: (id: string) => UiSkin | undefined;
};
export type UiCommand = {
  action: UiAction | "theme";
  screenId?: string;
  layerId?: string;
  themeId?: string;
};

export class UiFlowWorld {
  private instances = new Map<string, Instance>();
  private generation = 0;
  private stack: string[] = [];
  private entered = new Set<string>();
  private serial = 0;
  private theme?: string;
  private activeScreen?: string;
  private stylesVersion = 0;

  constructor(
    private data: GameData,
    private emit: (
      id: string,
      value?: Value,
      screen?: string,
      scene?: string,
    ) => void,
    private definition?: UiFlow,
  ) {}
  get paused() {
    for (const view of this.instances.values())
      if (!view.closing && view.asset.modal && view.asset.pause) return true;
    return false;
  }
  refresh(
    definition: UiFlow | undefined,
    primary: string,
    loaded: string[],
    reset?: string,
  ) {
    const previous = this.definition;
    this.definition = definition;
    if (previous !== definition) this.stylesVersion++;
    if (previous?.themeId !== definition?.themeId) this.theme = undefined;
    if (this.theme && !definition?.themes.some(({ id }) => id === this.theme))
      this.theme = undefined;
    const residents = new Set(loaded);
    if (reset) residents.delete(reset);
    for (const item of this.instances.values()) {
      const asset = definition?.screens.find(({ id }) => id === item.id);
      if (
        !asset ||
        (item.owner !== null && !residents.has(item.owner)) ||
        (asset.lifetime === "global") !== (item.owner === null)
      ) {
        this.remove(item);
        continue;
      }
      if (asset !== item.asset) {
        if (asset.document !== item.asset.document)
          item.world = this.create(item, asset, item.world);
        if (asset.layerId !== item.asset.layerId) item.layer = asset.layerId;
        item.asset = asset;
      }
      if (!definition?.layers.some(({ id }) => id === item.layer))
        item.layer = asset.layerId;
    }
    this.entered = new Set(
      [...this.entered].filter((key) => {
        const [owner, id] = JSON.parse(key) as [string | null, string];
        return (
          (owner === null || residents.has(owner)) &&
          !!definition?.entries.some(
            (entry) => entry.sceneId === owner && entry.screenId === id,
          )
        );
      }),
    );
    for (const entry of definition?.entries ?? []) {
      const key = JSON.stringify([entry.sceneId, entry.screenId]);
      if (
        this.entered.has(key) ||
        (entry.sceneId !== null && !loaded.includes(entry.sceneId))
      )
        continue;
      this.entered.add(key);
      this.show(entry.screenId, entry.sceneId ?? primary);
    }
  }
  private create(
    item: Pick<Instance, "id" | "owner">,
    asset: UiScreen,
    previous?: UiWorld,
  ) {
    return new UiWorld(
      asset.document,
      this.data,
      (id, value) => this.emit(id, value, item.id, item.owner ?? undefined),
      previous,
    );
  }
  private find(id: string, owner: string) {
    return [...this.instances.values()].find(
      (item) => item.id === id && (item.owner === null || item.owner === owner),
    );
  }
  private show(id: string, scene: string, layerId?: string) {
    const asset = this.definition?.screens.find((item) => item.id === id);
    if (!asset) throw new Error(`UI screen "${id}" is missing.`);
    if (layerId && !this.definition?.layers.some(({ id }) => id === layerId))
      throw new Error(`UI layer "${layerId}" is missing.`);
    let instance = this.find(id, scene);
    if (instance) {
      instance.closing = false;
      instance.order = ++this.serial;
      if (layerId) instance.layer = layerId;
      return instance;
    }
    const item = {
      id,
      owner: asset.lifetime === "global" ? null : scene,
      key: "ui-" + ++this.generation,
    };
    instance = {
      ...item,
      layer: layerId ?? asset.layerId,
      world: this.create(item, asset),
      asset,
      shown: asset.fade ? 0 : 1,
      order: ++this.serial,
    };
    this.instances.set(item.key, instance);
    return instance;
  }
  private remove(instance: Instance) {
    this.instances.delete(instance.key);
    this.stack = this.stack.filter((key) => key !== instance.key);
  }
  private hide(instance?: Instance) {
    if (!instance) return;
    if (!instance.asset.fade || !instance.shown) this.remove(instance);
    else instance.closing = true;
  }
  command(command: UiCommand, scene: string) {
    const { action, screenId, layerId, themeId } = command;
    if (action === "theme") {
      if (themeId && !this.definition?.themes.some(({ id }) => id === themeId))
        throw new Error(`UI theme "${themeId}" is missing.`);
      if (this.theme !== themeId) {
        this.theme = themeId;
        this.stylesVersion++;
      }
      return;
    }
    if (action === "pop") {
      const key = this.stack.pop();
      this.hide(key ? this.instances.get(key) : undefined);
      return;
    }
    if (!screenId) throw new Error("Choose a UI screen.");
    const instance = this.find(screenId, scene);
    if (action === "hide") return this.hide(instance);
    if (action === "move") {
      if (!layerId || !this.definition?.layers.some(({ id }) => id === layerId))
        throw new Error("Choose a UI layer.");
      if (instance) instance.layer = layerId;
      return;
    }
    const shown = this.show(screenId, scene, layerId);
    if (action === "push" || action === "replace") {
      if (action === "replace") {
        const key = this.stack.pop();
        if (key && shown.key !== key) this.hide(this.instances.get(key));
      }
      this.stack = this.stack.filter((key) => key !== shown.key);
      this.stack.push(shown.key);
    }
  }
  signal(id: string, scene: string, source?: string) {
    const routes = this.definition?.routes;
    const route =
      routes?.find(
        (route) => route.signalId === id && route.sourceId === source,
      ) ??
      routes?.find((route) => route.signalId === id && route.sourceId === null);
    if (!route) return;
    this.command(route, scene);
    return route.screenId ?? route.action;
  }
  advance(seconds: number) {
    for (const item of this.instances.values()) {
      if (!item.asset.fade) continue;
      const step = seconds / item.asset.fade;
      item.shown = Math.min(
        1,
        Math.max(0, item.shown + (item.closing ? -step : step)),
      );
      if (item.closing && !item.shown) this.remove(item);
    }
  }
  widgetWorld(legacy: UiWorld, id: string, screen?: string, scene?: string) {
    if (!screen && legacy.has(id)) return legacy;
    const candidates = [...this.instances.values()].filter(
      (item) =>
        !item.closing &&
        (!screen || item.id === screen) &&
        (item.owner === null || !scene || item.owner === scene) &&
        item.world.has(id),
    );
    if (candidates.length !== 1)
      throw new Error("Choose a visible screen with an unambiguous widget.");
    return candidates[0].world;
  }
  setWidget(
    legacy: UiWorld,
    id: string,
    property: Parameters<UiWorld["set"]>[1],
    value?: Value,
    screen?: string,
    scene?: string,
  ) {
    this.widgetWorld(legacy, id, screen, scene).set(id, property, value);
  }
  screenOpen(id: string, scene: string) {
    return [...this.instances.values()].some(
      (item) =>
        item.id === id &&
        !item.closing &&
        (item.owner === null || item.owner === scene),
    );
  }
  views(legacy: UiWorld): UiScreenView[] {
    const layers = this.definition?.layers;
    const ordered = [...this.instances.values()].sort(
      (a, b) =>
        (layers?.findIndex(({ id }) => id === a.layer) ?? 0) -
          (layers?.findIndex(({ id }) => id === b.layer) ?? 0) ||
        a.order - b.order,
    );
    const modal = ordered.findLastIndex(
      ({ asset, closing }) => asset.modal && !closing,
    );
    const activeKey = ordered[modal]?.key;
    const focus = this.activeScreen !== activeKey;
    this.activeScreen = activeKey;
    return [
      ...(legacy.document.widgets.length
        ? [
            {
              key: "legacy",
              world: legacy,
              active: modal < 0,
              block: false,
              opacity: 1,
              focus: focus && !activeKey,
            },
          ]
        : []),
      ...ordered.map((item, index) => ({
        key: item.key,
        id: item.id,
        world: item.world,
        active: (modal < 0 || index === modal) && !item.closing,
        block:
          (index === modal || (!item.asset.passthrough && modal < 0)) &&
          !item.closing,
        modal: index === modal,
        focus: focus && index === modal,
        opacity: item.shown,
        skinVersion: this.stylesVersion,
        skin: (style: string) =>
          resolveUiStyle(
            this.definition?.themes ?? [],
            this.theme ?? item.asset.themeId ?? this.definition?.themeId,
            style,
          ),
      })),
    ];
  }
}
