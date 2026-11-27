export type ProjectLocation = { token: string; folder: string };
export type OpenedProject = ProjectLocation & { source: string };
export type ImportedAsset = { name: string; source: string };
export type DesktopApi = {
  openProject(): Promise<OpenedProject | null>;
  saveProject(source: string, token?: string): Promise<ProjectLocation | null>;
  importSound(): Promise<ImportedAsset | null>;
  importImage(): Promise<ImportedAsset | null>;
  exportGame(source: string, filename: string): Promise<boolean>;
};

export const channels = {
  open: "mosaic:project-open",
  save: "mosaic:project-save",
  image: "mosaic:image-import",
  sound: "mosaic:sound-import",
  export: "mosaic:game-export",
} as const;
