import {
  BookOpen,
  Braces,
  Database,
  Globe,
  List,
  Rows3,
  Save,
  Variable,
} from "lucide-react";
import { useState } from "react";
import { emptyCatalog } from "./data-controls";
import { Enums, Globals, Resources, Sheets, Structs } from "./data-tables";
import { Localization, Saves } from "./data-settings";
import { useEditor } from "./state";

const tabs = {
  Sheets: [Rows3, Sheets],
  Enums: [List, Enums],
  Structs: [Braces, Structs],
  Resources: [BookOpen, Resources],
  Globals: [Variable, Globals],
  Saves: [Save, Saves],
  Localization: [Globe, Localization],
} as const;
type Tab = keyof typeof tabs;
const tabNames = Object.keys(tabs) as Tab[];
export function DataWorkspace() {
  const data = useEditor((state) => state.project.data) ?? emptyCatalog;
  const project = useEditor((state) => state.project.id);
  const [tab, setTab] = useState<Tab>("Sheets");
  const [, Editor] = tabs[tab];
  return (
    <div className="workspace">
      <div className="workspace-bar">
        <Database size={17} />
        <strong>Project Data</strong>
      </div>
      <nav className="data-tabs" aria-label="Data tools">
        {tabNames.map((name) => {
          const [Icon] = tabs[name];
          return (
            <button
              key={name}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              <Icon size={15} /> {name}
            </button>
          );
        })}
      </nav>
      <div className="system-body data-workspace" key={project}>
        <Editor data={data} />
      </div>
    </div>
  );
}
