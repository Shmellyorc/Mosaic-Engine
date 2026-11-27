import { contextBridge, ipcRenderer } from "electron";
import { channels, type DesktopApi } from "./contracts";

const api: DesktopApi = {
  openProject: () => ipcRenderer.invoke(channels.open),
  saveProject: (source, token) =>
    ipcRenderer.invoke(channels.save, source, token),
  importSound: () => ipcRenderer.invoke(channels.sound),
  importImage: () => ipcRenderer.invoke(channels.image),
  exportGame: (source, filename) =>
    ipcRenderer.invoke(channels.export, source, filename),
};
contextBridge.exposeInMainWorld("mosaic", api);
