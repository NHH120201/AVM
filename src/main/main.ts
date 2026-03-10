import { app, BrowserWindow, ipcMain, Menu, screen, dialog } from "electron";
import fs from "fs";
import path from "path";
import { runPipeline } from "./pipeline";
import { spawn } from "child_process";
import { saveUrlSet, listTopics } from "./urlSets";
import { execFile } from "child_process";
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

// Pick a voice prompt WAV for TTS
ipcMain.handle("tts:pickPrompt", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select voice sample (WAV)",
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: ["wav"] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return { path: result.filePaths[0] };
});

ipcMain.handle("video:listRuns", async () => {
  return listRuns();
});

// List generated TTS voices (WAV files) from the out/ folder
ipcMain.handle("tts:listGenerated", async () => {
  try {
    const outDir = path.join(process.cwd(), "out");
    const files = fs.readdirSync(outDir, { withFileTypes: true });
    const wavs = files
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith(".wav"))
      .map((f) => ({
        label: f.name,
        path: path.join(outDir, f.name),
      }));
    // Sort by name so tts-output, tts-output (1), ... are ordered
    wavs.sort((a, b) => a.label.localeCompare(b.label));
    return wavs;
  } catch {
    return [];
  }
});

// Manually pick an external audio file for narration
ipcMain.handle("audio:pickFile", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select narration audio",
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: ["wav", "mp3", "flac", "ogg", "m4a"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return { path: result.filePaths[0] };
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
  const { topic, items, maxClipSeconds, maxDurationSeconds, narrationAudioPath } = args as {
    topic: string;
    items: PlaylistItem[];
    maxClipSeconds: number;
    maxDurationSeconds: number;
    narrationAudioPath?: string | null;
  };
  return buildFinalFromPlaylist(topic, items, maxClipSeconds, maxDurationSeconds, narrationAudioPath);
});

// Speech-to-text: transcribe a narration WAV with Vosk
ipcMain.handle("tts:transcribe", async (_event, args: { audioPath: string }) => {
  const audioPath = args.audioPath;
  const modelPath = path.join(process.cwd(), "vosk-model-en-us-0.42-gigaspeech", "vosk-model-en-us-0.42-gigaspeech");

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Vosk model not found at ${modelPath}`);
  }

  const outJson = audioPath.replace(/\.wav$/i, ".vosk.json");

  return new Promise<{ words: { word: string; start: number; end: number }[] }>((resolve, reject) => {
    const pythonExe = "python";
    const scriptPath = path.join(process.cwd(), "stt_vosk.py");

    execFile(pythonExe, [scriptPath, audioPath, modelPath, outJson], { cwd: process.cwd() }, (err) => {
      if (err) {
        console.error("[STT] Failed:", err);
        reject(err);
        return;
      }
      try {
        const raw = fs.readFileSync(outJson, "utf8");
        const parsed = JSON.parse(raw);
        const words = Array.isArray(parsed.words) ? parsed.words : [];
        resolve({ words });
      } catch (e) {
        reject(e);
      }
    });
  });
});

// Text-to-Speech: run Chatterbox Turbo via Python helper script
ipcMain.handle("tts:generate", async (_event, args: { text: string; outputPath?: string; promptPath?: string | null; exaggeration?: number; cfgWeight?: number }) => {
  const { text, outputPath, promptPath, exaggeration, cfgWeight } = args;

  let outPath = outputPath && outputPath.trim().length > 0
    ? outputPath
    : path.join(process.cwd(), "out", "tts-output.wav");

  // If using default path, auto-increment to avoid overwriting previous generations
  if (!outputPath || !outputPath.trim().length) {
    const outDirDefault = path.dirname(outPath);
    const baseName = path.basename(outPath, path.extname(outPath));
    const ext = path.extname(outPath) || ".wav";
    let idx = 1;
    while (fs.existsSync(outPath)) {
      outPath = path.join(outDirDefault, `${baseName} (${idx})${ext}`);
      idx += 1;
    }
  }

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  return new Promise<{ outputPath: string }>((resolve, reject) => {
    const pythonExe = "python"; // uses system default Python (3.11)
    const scriptPath = path.join(process.cwd(), "tts_chatterbox_turbo.py");

    const argsList = [scriptPath, text, outPath];
    if (promptPath && promptPath.trim().length > 0) {
      argsList.push("--prompt", promptPath);
    }
    if (typeof exaggeration === "number") {
      argsList.push("--exaggeration", String(exaggeration));
    }
    if (typeof cfgWeight === "number") {
      argsList.push("--cfg_weight", String(cfgWeight));
    }

    const env = { ...process.env };
    // Prefer HF_TOKEN from environment, but allow a local hf_token.txt file (ignored by Git)
    if (!env.HF_TOKEN) {
      try {
        const tokenPath = path.join(process.cwd(), "hf_token.txt");
        if (fs.existsSync(tokenPath)) {
          const fileToken = fs.readFileSync(tokenPath, "utf8").trim();
          if (fileToken) {
            env.HF_TOKEN = fileToken;
          }
        }
      } catch (err) {
        console.error("[TTS] Failed to read hf_token.txt:", err);
      }
    }

    const child = spawn(pythonExe, argsList, {
      cwd: process.cwd(),
      env,
    });

    child.stdout.on("data", (data) => {
      console.log("[TTS stdout]", data.toString());
    });
    child.stderr.on("data", (data) => {
      console.error("[TTS stderr]", data.toString());
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ outputPath: outPath });
      } else {
        reject(new Error(`TTS process exited with code ${code}`));
      }
    });
  });
});
