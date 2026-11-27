import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, File, X } from "lucide-react";
import { applyPrefabRevision, type Prefab } from "@mosaic/model";
import { documentInfo, documentKey } from "./documents";
import {
  activeDocument,
  closeDocument,
  openDocument,
  useEditor,
} from "./state";
import { Field, NumberField, Section, TextField } from "./controls";
import { insertPrefab } from "./entity-components";

export function DocumentTabs({ children }: { children: ReactNode }) {
  const documents = useEditor((state) => state.documents);
  const active = useEditor((state) => state.activeDocument);
  const project = useEditor((state) => state.project);
  const tabs = documents.flatMap((ref) => {
    const info = documentInfo(project, ref);
    return info ? [{ ref, key: documentKey(ref), title: info.title }] : [];
  });
  return (
    <div className="document-strip">
      <nav
        className="document-tabs"
        role="tablist"
        aria-label="Open documents"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          const index = tabs.findIndex(({ key }) => active === key);
          const next =
            tabs[
              (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) %
                tabs.length
            ];
          if (next) {
            event.preventDefault();
            openDocument(next.ref);
            [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="tab"]',
              ),
            ]
              .find((element) => element.dataset.document === next.key)
              ?.focus();
          }
        }}
      >
        {tabs.map(({ ref, key, title }) => (
          <div key={key} className="document-tab" data-active={active === key}>
            <button
              role="tab"
              data-document={key}
              aria-selected={active === key}
              onClick={() => openDocument(ref)}
              title={title}
            >
              <File size={15} />
              <span>{title}</span>
            </button>
            <button
              aria-label={"Close " + title}
              title={"Close " + title}
              onClick={() => closeDocument(ref)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function LocalTools({
  title,
  storageKey,
  children,
  tool,
}: {
  title: string;
  storageKey: string;
  children: ReactNode;
  tool: ReactNode;
}) {
  const key = "mosaic-context-" + storageKey;
  const [width, setWidth] = useState(() => {
    const value = Number(localStorage.getItem(key + "-width"));
    return value >= 130 && value <= 440 ? value : 196;
  });
  const [hidden, setHidden] = useState(
    () => localStorage.getItem(key + "-hidden") === "true",
  );
  const drag = useRef<{ x: number; width: number } | null>(null);
  function resize(value: number) {
    const next = Math.min(440, Math.max(130, value));
    setWidth(next);
    localStorage.setItem(key + "-width", String(next));
  }
  return (
    <div
      className="context-editor"
      style={{
        gridTemplateColumns: hidden
          ? "32px minmax(0,1fr)"
          : `minmax(120px,${width}px) 5px minmax(0,1fr)`,
      }}
    >
      <aside className="context-tools" aria-label={title}>
        <header>
          {!hidden && <strong>{title}</strong>}
          <button
            aria-label={(hidden ? "Expand " : "Collapse ") + title}
            title={(hidden ? "Expand " : "Collapse ") + title}
            onClick={() => {
              localStorage.setItem(key + "-hidden", String(!hidden));
              setHidden(!hidden);
            }}
          >
            {hidden ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </header>
        {!hidden && <div className="context-tool-body">{tool}</div>}
      </aside>
      {!hidden && (
        <div
          className="context-divider"
          role="separator"
          aria-label={"Resize " + title}
          aria-orientation="vertical"
          tabIndex={0}
          aria-valuemin={130}
          aria-valuemax={440}
          aria-valuenow={width}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            resize(width + (event.key === "ArrowLeft" ? -12 : 12));
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, width };
          }}
          onPointerMove={(event) => {
            if (drag.current)
              resize(drag.current.width + event.clientX - drag.current.x);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        />
      )}
      <div className="context-content">{children}</div>
    </div>
  );
}

export function PrefabDocument() {
  const ref = useEditor(activeDocument);
  const prefab = useEditor((state) =>
    state.project.prefabs?.find(({ id }) => id === ref?.id),
  );
  const [memberId, setMemberId] = useState("");
  if (!prefab) return null;
  const member =
    prefab.entities.find(({ id }) => id === memberId) ??
    prefab.entities.find(({ parentId }) => !parentId);
  function change(recipe: (draft: Prefab) => void) {
    if (!prefab) return;
    try {
      const revision = structuredClone(prefab);
      recipe(revision);
      useEditor.getState().edit((project) => {
        applyPrefabRevision(project.scenes, prefab, revision);
        const list = project.prefabs!;
        list[list.findIndex(({ id }) => id === prefab.id)] = revision;
      });
    } catch (error) {
      useEditor.getState().report(String(error), "error");
    }
  }
  return (
    <LocalTools
      title="Prefab Hierarchy"
      storageKey="prefab-tree"
      tool={
        <div className="panel-body">
          {prefab.entities.map((entity) => (
            <button
              className={`tree-row ${entity.id === member?.id ? "selected" : ""}`}
              key={entity.id}
              style={{ paddingInlineStart: entity.parentId ? 20 : 6 }}
              onClick={() => setMemberId(entity.id)}
            >
              {entity.name}
            </button>
          ))}
        </div>
      }
    >
      <div className="workspace">
        <div className="workspace-bar">
          <strong>{prefab.name}.prefab</strong>
          <button className="push" onClick={() => insertPrefab(prefab.id)}>
            Instantiate prefab
          </button>
        </div>
        <div className="panel-body">
          <Field label="Asset name">
            <TextField
              label="Prefab name"
              value={prefab.name}
              onChange={(name) =>
                change((draft) => {
                  draft.name = name;
                })
              }
            />
          </Field>
          {member && (
            <Section title="Entity defaults">
              <Field label="Name">
                <TextField
                  label="Prefab entity name"
                  value={member.name}
                  onChange={(name) =>
                    change((draft) => {
                      draft.entities.find(({ id }) => id === member.id)!.name =
                        name;
                    })
                  }
                />
              </Field>
              {(["x", "y", "width", "height", "rotation"] as const).map(
                (key) => (
                  <Field label={key} key={key}>
                    <NumberField
                      label={"Prefab entity " + key}
                      step={key === "width" || key === "height" ? 1 : 0.1}
                      min={key === "width" || key === "height" ? 1 : -1e7}
                      max={key === "width" || key === "height" ? 8192 : 1e7}
                      value={member.transform[key]}
                      onChange={(value) =>
                        change((draft) => {
                          draft.entities.find(
                            ({ id }) => id === member.id,
                          )!.transform[key] = value;
                        })
                      }
                    />
                  </Field>
                ),
              )}
              <label>
                <input
                  type="checkbox"
                  checked={member.visible}
                  onChange={(event) =>
                    change((draft) => {
                      draft.entities.find(
                        ({ id }) => id === member.id,
                      )!.visible = event.target.checked;
                    })
                  }
                />{" "}
                Visible
              </label>
            </Section>
          )}
        </div>
      </div>
    </LocalTools>
  );
}
