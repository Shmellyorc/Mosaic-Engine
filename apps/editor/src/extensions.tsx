import { useRef } from "react";
import { parseExtensionManifest } from "@mosaic/blueprints";
import { useEditor } from "./state";

export function ExtensionPanel() {
  const extensions = useEditor((state) => state.project.extensions);
  const input = useRef<HTMLInputElement>(null);
  async function load(file: File) {
    const projectId = useEditor.getState().project.id;
    try {
      if (file.size > 64 * 1024)
        throw new Error("Choose a manifest up to 64 KiB.");
      const manifest = parseExtensionManifest(JSON.parse(await file.text()));
      const state = useEditor.getState();
      if (state.project.id !== projectId) return;
      const installed = state.project.extensions ?? [];
      const replacing = installed.some(({ id }) => id === manifest.id);
      if (installed.length >= 64 && !replacing)
        throw new Error("This project already has 64 extensions.");
      state.edit((project) => {
        project.extensions ??= [];
        const index = project.extensions.findIndex(
          ({ id }) => id === manifest.id,
        );
        if (index === -1) project.extensions.push(manifest);
        else project.extensions[index] = manifest;
      });
      state.report(manifest.name + (replacing ? " updated." : " installed."));
    } catch (error) {
      useEditor
        .getState()
        .report(
          error instanceof Error ? error.message : String(error),
          "error",
        );
    }
  }
  return (
    <div className="panel-body extension-panel">
      <button className="section-button" onClick={() => input.current?.click()}>
        Import extension
      </button>
      <input
        ref={input}
        type="file"
        aria-label="Extension manifest"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void load(file);
        }}
      />
      {!extensions?.length && (
        <p className="muted">
          Import a version 1 JSON manifest to add typed Blueprint expressions.
        </p>
      )}
      {extensions?.map((extension) => (
        <details key={extension.id} open>
          <summary>{extension.name}</summary>
          <p className="muted">{extension.id}</p>
          <ul>
            {extension.functions.map((fn) => (
              <li key={fn.id}>
                {fn.name}{" "}
                <code>
                  (
                  {fn.parameters
                    .map(({ id, type }) => id + " " + type)
                    .join(", ")}
                  ) → {fn.result}
                </code>
              </li>
            ))}
          </ul>
          <button
            aria-label={"Remove " + extension.name}
            onClick={() =>
              useEditor.getState().edit((project) => {
                project.extensions = project.extensions?.filter(
                  ({ id }) => id !== extension.id,
                );
              })
            }
          >
            Remove
          </button>
        </details>
      ))}
    </div>
  );
}
