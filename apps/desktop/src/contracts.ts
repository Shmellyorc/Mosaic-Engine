export type ProjectLocation = { token: string; folder: string };
export type OpenedProject = ProjectLocation & { source: string };
export type ImportedImage = { name: string; source: string };
export type DesktopApi = {
  openProject(): Promise<OpenedProject | null>;
  saveProject(source: string, token?: string): Promise<ProjectLocation | null>;
  importImage(): Promise<ImportedImage | null>;
  exportGame(source: string, filename: string): Promise<boolean>;
};

export const channels = {
  open: "mosaic:project-open",
  save: "mosaic:project-save",
  image: "mosaic:image-import",
  export: "mosaic:game-export",
} as const;
