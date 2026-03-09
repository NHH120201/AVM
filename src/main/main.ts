import { app, BrowserWindow, ipcMain, Menu, screen, dialog } from "electron";
import fs from "fs";
import path from "path";
import { runPipeline } from "./pipeline";
import { saveUrlSet, listTopics } from "./urlSets";
import { loadLatestManifest } from "./manifest";
import { listRuns } from "./runs";
import { buildFinalFromPlaylist, PlaylistItem } from "./finalFromPlaylist";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  const initialWidth = Math.min(1400, Math.floor(screenW * 0.8));
  const initialHeight = Math.min(900, Math.floor(screenH * 0.8));

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  // Always load built index.html from dist/renderer so the app runs as a local file,
  // which allows file:/// video URLs to be played without browser restrictions.
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  setupMenu();
}

function setupMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }]
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Window size: Small (960×600)",
          click: () => {
            if (mainWindow) mainWindow.setSize(960, 600);
          }
        },
        {
          label: "Window size: Medium (1280×720)",
          click: () => {
            if (mainWindow) mainWindow.setSize(1280, 720);
          }
        },
        {
          label: "Window size: Large (1600×900)",
          click: () => {
            if (mainWindow) mainWindow.setSize(1600, 900);
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggledevtools" },
        { type: "separator" },
        { role: "resetzoom" },
        { role: "zoomin" },
        { role: "zoomout" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC

ipcMain.handle("pipeline:run", async (event, args: {
  topic: string;
  targetDuration: number;
  mute: boolean;
  maxClipSeconds: number;
  outputFolder: string;
  urls?: string[];             // ← add
}) => {
  const webContents = event.sender;

  const onLog = (line: string) => {
    webContents.send("pipeline:log", line);
  };

  const onStep = (step: string, status: string) => {
    webContents.send("pipeline:step", { step, status });
  };

    const result = await runPipeline({
    topic: args.topic,
    targetDuration: args.targetDuration,
    mute: args.mute,
    maxClipSeconds: args.maxClipSeconds,
    outputFolder: args.outputFolder,
    urls: args.urls,             // ← add
    onLog,
    onStep
  });

  return result;
});

ipcMain.handle("urlsets:save", async (_event, args: {
  catalogName: string;
  topic?: string | null;
  urls: string[];
}) => {
  const set = saveUrlSet(args.catalogName, args.topic ?? null, args.urls);
  return set;
});

ipcMain.handle("urlsets:listTopics", async () => {
  return listTopics();
});

// List existing topic folders under a given base folder
ipcMain.handle("video:listTopicsInFolder", async (_event, args: { baseFolder: string }) => {
  const base = args.baseFolder;
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true });
    const topics: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        topics.push(entry.name);
      }
    }
    return topics;
  } catch {
    return [];
  }
});

ipcMain.handle("manifest:load", async (_event, args: { topic: string }) => {
  const manifest = loadLatestManifest(args.topic);
  if (!manifest) return null;
  return { videos: manifest.videos };
});

ipcMain.handle("video:injectCaption", async (_event, args: {
  inputPath: string;
  caption: string;
  font: string;
  color: string;
  size: number;
}) => {
  // Stub for now: just return the same path; real ffmpeg overlay can be added later.
  return { outputPath: args.inputPath };
});

ipcMain.handle("video:pickFinal", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select final video",
    properties: ["openFile"],
    filters: [
      { name: "Video", extensions: ["mp4", "mov", "mkv"] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return { path: result.filePaths[0] };
});

ipcMain.handle("video:listRuns", async () => {
  return listRuns();
});

ipcMain.handle("video:pickFolder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select video folder",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const folder = result.filePaths[0];
  let files: string[] = [];
  let subdirs: string[] = [];
  try {
    const exts = [".mp4", ".mov", ".mkv", ".avi", ".wmv", ".flv"];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (exts.some((ext) => lower.endsWith(ext))) {
            files.push(full);
          }
        }
      }
    };

    walk(folder);
  } catch {
    files = [];
  }
  return { folder, files };
});

ipcMain.handle("video:buildFinalFromSelected", async (_event, args) => {
  const { topic, items, maxClipSeconds, maxDurationSeconds } = args as {
    topic: string;
    items: PlaylistItem[];
    maxClipSeconds: number;
    maxDurationSeconds: number;
  };
  return buildFinalFromPlaylist(topic, items, maxClipSeconds, maxDurationSeconds);
});