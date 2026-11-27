import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import { constants } from "node:fs";
import { open, readFile, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  MAX_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_SOUND_BYTES,
  inspectWav,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { gameHtml } from "../../game/src/html";
import { channels } from "./contracts";

const projectFile = "project.mosaic.json";
const editor = join(__dirname, "editor", "index.html");
const locations = new Map<string, string>();
let window: BrowserWindow | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function readBounded(path: string, max: number) {
  const handle = await open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > max)
      throw new Error("File is invalid or exceeds its size limit.");
    const data = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < data.length) {
      const { bytesRead } = await handle.read(
        data,
        total,
        data.length - total,
        total,
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total !== stat.size)
      throw new Error("File changed while it was being read.");
    return data.subarray(0, total);
  } finally {
    await handle.close();
  }
}
async function atomicWrite(path: string, contents: string, overwrite = true) {
  const temporary = join(dirname(path), `.mosaic-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (overwrite) await rename(temporary, path);
    else {
      const { link } = await import("node:fs/promises");
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error(
            "This folder already contains a Mosaic project. Open it or choose a different folder.",
          );
        throw error;
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function secured(
  channel: string,
  handler: (
    parent: BrowserWindow,
    ...args: unknown[]
  ) => unknown | Promise<unknown>,
) {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const parent = window;
    if (
      !parent ||
      event.sender !== parent.webContents ||
      event.senderFrame !== event.sender.mainFrame ||
      event.senderFrame?.url !== pathToFileURL(editor).href
    )
      throw new Error("Mosaic IPC sender was rejected.");
    const result = queue.then(() => handler(parent, ...args));
    queue = result.catch(() => undefined);
    return result;
  });
}
function sourceProject(value: unknown) {
  if (typeof value !== "string")
    throw new Error("Expected serialized Mosaic project data.");
  return parseProject(value);
}
function remember(folder: string) {
  const token = randomUUID();
  locations.set(token, folder);
  return { token, folder };
}

secured(channels.open, async (parent) => {
  const result = await dialog.showOpenDialog(parent, {
    title: "Open Mosaic Project Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  const folder = await realpath(result.filePaths[0]);
  const data = await readBounded(join(folder, projectFile), MAX_PROJECT_BYTES);
  return {
    ...remember(folder),
    source: serializeProject(parseProject(data.toString("utf8"))),
  };
});
secured(channels.save, async (parent, source, token) => {
  const project = serializeProject(sourceProject(source));
  if (token !== undefined) {
    const folder = typeof token === "string" ? locations.get(token) : undefined;
    if (!folder)
      throw new Error("The project folder is no longer open. Use Save As.");
    await atomicWrite(join(folder, projectFile), project);
    return { token, folder };
  }
  const result = await dialog.showOpenDialog(parent, {
    title: "Save to a Mosaic Project Folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled) return null;
  const folder = await realpath(result.filePaths[0]);
  await atomicWrite(join(folder, projectFile), project, false);
  return remember(folder);
});
const formats: Record<string, string> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".webp": "webp",
  ".gif": "gif",
};
secured(channels.image, async (parent) => {
  const result = await dialog.showOpenDialog(parent, {
    title: "Import Sprite Image",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ],
  });
  if (result.canceled) return null;
  const file = await realpath(result.filePaths[0]);
  const kind = formats[extname(file).toLowerCase()];
  if (!kind) throw new Error("Choose a PNG, JPEG, WebP or GIF file.");
  const data = await readBounded(file, MAX_IMAGE_BYTES);
  return {
    name: basename(file).slice(0, 100),
    source: `data:image/${kind};base64,${data.toString("base64")}`,
  };
});
secured(channels.sound, async (parent) => {
  const result = await dialog.showOpenDialog(parent, {
    title: "Import WAV Sound",
    properties: ["openFile"],
    filters: [{ name: "WAV audio", extensions: ["wav"] }],
  });
  if (result.canceled) return null;
  const file = await realpath(result.filePaths[0]);
  const data = await readBounded(file, MAX_SOUND_BYTES);
  inspectWav(data);
  return {
    name: basename(file).slice(0, 100),
    source: "data:audio/wav;base64," + data.toString("base64"),
  };
});
secured(channels.export, async (parent, source, filename) => {
  const project = sourceProject(source);
  if (
    typeof filename !== "string" ||
    !/^[a-z0-9-]{1,100}\.html$/.test(filename)
  )
    throw new Error("Invalid export filename.");
  const result = await dialog.showSaveDialog(parent, {
    title: "Export Standalone Game",
    defaultPath: filename,
    filters: [{ name: "HTML game", extensions: ["html"] }],
  });
  if (result.canceled || !result.filePath) return false;
  const runtime = await readFile(join(__dirname, "game.js"), "utf8");
  await atomicWrite(result.filePath, gameHtml(project, runtime));
  return true;
});

async function createWindow() {
  const next = new BrowserWindow({
    title: "Mosaic Engine",
    width: 1480,
    height: 900,
    minWidth: 850,
    minHeight: 560,
    backgroundColor: "#10111c",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window = next;
  next.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  next.webContents.on("will-navigate", (event) => event.preventDefault());
  next.webContents.on("will-attach-webview", (event) => event.preventDefault());
  next.on("closed", () => {
    if (window === next) window = null;
    locations.clear();
  });
  await next.loadFile(editor);
}

app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    await createWindow();
    app.on("activate", () => {
      if (!window) void createWindow();
    });
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
