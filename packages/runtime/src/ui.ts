import { displayValue, type UiProperty, type Value } from "@mosaic/blueprints";
import {
  interactiveWidget,
  normalizeWidgetValue,
  widgetValueType,
  widgetRange,
  type UiDocument,
  type Widget,
  type WidgetBinding,
  type WidgetValue,
} from "@mosaic/model";
import type { GameData } from "./data";

type View = {
  text: string;
  visible: boolean;
  enabled: boolean;
  value?: WidgetValue;
};
const emptyUi: UiDocument = { widgets: [] };

export class UiWorld {
  readonly document: UiDocument;
  private widgets: Map<string, Widget>;
  private changes = new Map<string, Partial<View>>();
  private changed = 0;
  focusRequest?: { id: string };

  constructor(
    document: UiDocument | undefined,
    private data: GameData,
    private emit: (id: string, value?: Value) => void,
  ) {
    this.document = document ?? emptyUi;
    this.widgets = new Map(
      this.document.widgets.map((widget) => [widget.id, widget]),
    );
    if (this.document.initialFocus)
      this.focusRequest = { id: this.document.initialFocus };
  }
  get revision() {
    return this.changed + this.data.revision;
  }

  private binding(binding?: WidgetBinding): Value | undefined {
    if (!binding) return;
    try {
      const value = this.data.read(
        binding.source,
        binding.id,
        binding.source === "sheet"
          ? this.data.index.rowById(binding.id, binding.rowId)?.key
          : undefined,
      );
      if ("field" in binding)
        return typeof value === "object" &&
          value.kind === "record" &&
          Object.hasOwn(value.fields, binding.field)
          ? value.fields[binding.field]
          : undefined;
      return value;
    } catch {
      return undefined;
    }
  }
  private widget(id: string) {
    const widget = this.widgets.get(id);
    if (!widget) throw Error("The UI widget is missing from this scene.");
    return widget;
  }
  view(id: string): View {
    const widget = this.widget(id);
    const change = this.changes.get(id);
    const boundText =
      change?.text === undefined ? this.binding(widget.textBinding) : undefined;
    let value = change?.value;
    if (value === undefined) {
      const boundValue = this.binding(widget.valueBinding);
      const type = widgetValueType(widget.kind);
      const fallback =
        type === "boolean"
          ? false
          : type === "string"
            ? ""
            : type === "number"
              ? widgetRange(widget).min
              : undefined;
      value =
        widget.value === undefined
          ? fallback
          : normalizeWidgetValue(widget, widget.value);
      if (boundValue !== undefined && typeof boundValue !== "object") {
        try {
          value = normalizeWidgetValue(widget, boundValue);
        } catch {
          /* Keep the authored default when a binding changes type. */
        }
      }
    }
    return {
      text:
        change?.text ??
        (boundText === undefined ? widget.text : displayValue(boundText)),
      enabled: change?.enabled ?? widget.enabled,
      visible: change?.visible ?? widget.visible,
      value,
    };
  }
  private amend(id: string, key: keyof View, value: WidgetValue) {
    const patch = this.changes.get(id);
    if (patch?.[key] === value) return;
    this.changes.set(id, { ...patch, [key]: value });
    this.changed++;
  }
  available(id: string) {
    let widget = this.widgets.get(id);
    if (!widget || !interactiveWidget(widget.kind)) return false;
    while (widget) {
      const patch = this.changes.get(widget.id);
      if (
        !(patch?.enabled ?? widget.enabled) ||
        !(patch?.visible ?? widget.visible)
      )
        return false;
      widget = widget.parent ? this.widgets.get(widget.parent) : undefined;
    }
    return true;
  }
  set(id: string, property: UiProperty, value?: Value) {
    const widget = this.widget(id);
    switch (property) {
      case "focus":
        if (!interactiveWidget(widget.kind))
          throw Error("Focus requires an interactive widget.");
        this.focusRequest = { id };
        this.changed++;
        return;
      case "value":
        if (typeof value === "object" || value === undefined)
          throw Error("A UI value must be text, a number, or a Boolean.");
        this.amend(id, "value", normalizeWidgetValue(widget, value));
        return;
      case "text":
        if (widget.kind === "container")
          throw Error("A layout container has no text.");
        if (typeof value !== "string")
          throw Error("UI text requires a string.");
        this.amend(id, "text", value.slice(0, 300));
        return;
      case "visible":
      case "enabled":
        if (typeof value !== "boolean")
          throw Error("UI state requires a Boolean.");
        this.amend(id, property, value);
        return;
    }
  }

  interact(id: string, value?: WidgetValue) {
    if (!this.available(id)) return;
    const widget = this.widget(id);
    if (widget.kind !== "button") {
      if (value === undefined) return;
      value = normalizeWidgetValue(widget, value);
      if (this.view(id).value === value) return;
      if (widget.writeBack && widget.valueBinding?.source === "global") {
        this.data.write(widget.valueBinding.id, value);
        const patch = this.changes.get(id);
        if (patch?.value !== undefined) {
          delete patch.value;
          this.changed++;
        }
      } else this.amend(id, "value", value);
    }
    if (widget.signal)
      this.emit(widget.signal, widget.kind === "button" ? undefined : value);
  }
}
