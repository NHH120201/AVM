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

function buildAssFromVoskJson(
  voskJsonPath: string,
  opts: { font?: string; size?: number; color?: string; position?: "bottom" | "middle" | "top" }
): string {
  const raw = fs.readFileSync(voskJsonPath, "utf8");
  const parsed = JSON.parse(raw);
  const words: { word: string; start: number; end: number }[] = Array.isArray(parsed.words)
    ? parsed.words
    : [];

  const OFFSET = 0.21 // subtitles appear this many seconds earlier

  const chunks: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += 3) {
    const slice = words.slice(i, i + 3);
    if (!slice.length) continue;

    const startRaw = slice[0].start ?? 0;
    const endRaw = slice[slice.length - 1].end ?? startRaw + 1;

    const start = Math.max(0, startRaw - OFFSET);
    const end = Math.max(start + 0.1, endRaw - OFFSET);

    const text = slice.map((w) => w.word).join(" ");
    chunks.push({ start, end, text });
  }

  const formatAssTime = (sec: number) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = Math.floor(sec % 60);
    const centis = Math.floor((sec - Math.floor(sec)) * 100);
    const pad = (n: number, width: number) => String(n).padStart(width, "0");
    return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(centis, 2)}`;
  };

  // Map simple color names/hex to ASS BGR format (&HAABBGGRR).
  const toAssColor = (color?: string): string => {
    const lower = (color || "").toLowerCase().trim();
    let r = 255, g = 255, b = 255; // default white
    if (lower === "yellow") { r = 255; g = 255; b = 0; }
    else if (lower === "cyan") { r = 0; g = 255; b = 255; }
    else if (lower.startsWith("#") && (lower.length === 7)) {
      const hex = lower.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    const toByte = (n: number) => {
      const v = Math.max(0, Math.min(255, n | 0));
      return v.toString(16).padStart(2, "0");
    };
    const rr = toByte(r);
    const gg = toByte(g);
    const bb = toByte(b);
    // &HAABBGGRR - we use AA=00 (opaque)
    return `&H00${bb}${gg}${rr}`;
  };

  const fontName = opts.font && opts.font.trim().length > 0 ? opts.font.trim() : "Segoe UI";
  const fontSize = typeof opts.size === "number" && opts.size > 0 ? opts.size : 40;
  const primaryColor = toAssColor(opts.color);
  const alignment = opts.position === "top" ? 8 : opts.position === "middle" ? 5 : 2;

  const lines: string[] = [];
  lines.push("[Script Info]");
  lines.push("ScriptType: v4.00+");
  lines.push("");
  lines.push("[V4+ Styles]");
  lines.push(
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
  );
  const outlineColour = "&H00000000";
  const backColour = "&H64000000"; // semi-transparent background
  const style = [
    "Default",
    fontName,
    fontSize,
    primaryColor,
    outlineColour,
    backColour,
    0, // Bold
    0, // Italic
    1, // BorderStyle (outline)
    2, // Outline
    2, // Shadow
    alignment, // Alignment
    10,
    10,
    40,
    1,
  ].join(",");
  lines.push(`Style: ${style}`);
  lines.push("");

  lines.push("[Events]");
  lines.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
  for (const c of chunks) {
    lines.push(
      `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${c.text}`
    );
  }

  const base = voskJsonPath.replace(/\.vosk\.json$/i, "");
  const assPath = `${base}.ass`;
  fs.writeFileSync(assPath, lines.join("\n"), "utf8");
  return assPath;
}

ipcMain.handle("video:injectCaption", async (_event, args: {
  inputPath: string;
  caption?: string;
  font?: string;
  color?: string;
  size?: number;
  voskJsonPath?: string;
}) => {
  const inputPath = args.inputPath;
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input video not found: ${inputPath}`);
  }

  let assPath: string | null = null;
  if (args.voskJsonPath && fs.existsSync(args.voskJsonPath)) {
    assPath = buildAssFromVoskJson(args.voskJsonPath, {
      font: args.font,
      size: args.size,
      color: args.color,
    });
  } else {
    // For now we only support Vosk-driven subtitles; fallback is no-op
    return { outputPath: inputPath };
  }

  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath) || ".mp4";
  const baseName = path.basename(inputPath, ext);
  let outPath = path.join(dir, `${baseName}_subbed${ext}`);
  let idx = 1;
  while (fs.existsSync(outPath)) {
    outPath = path.join(dir, `${baseName}_subbed (${idx})${ext}`);
    idx += 1;
  }

  return await new Promise<{ outputPath: string }>((resolve, reject) => {
    // Windows paths + ffmpeg subtitles filter are extremely picky. We:
    // - Use forward slashes
    // - Escape ':' as '\:' inside the filter
    // - Escape spaces and parentheses
    // - Wrap the whole thing in single quotes for the filter argument.
    const srtForFilterInner = assPath
      .replace(/\\/g, "/")    // backslashes → forward slashes
      .replace(/:/g, "\\:")   // C:/ → C\:/
      .replace(/ /g, "\\ ")   // spaces
      .replace(/\(/g, "\\(") // '('
      .replace(/\)/g, "\\)"); // ')'

    const filterExpr = `subtitles='${srtForFilterInner}'`;

    const ffmpegArgs = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      filterExpr,
      "-c:a",
      "copy",
      outPath,
    ];

    const child = spawn("ffmpeg", ffmpegArgs, { cwd: process.cwd() });

    child.stdout.on("data", (data) => {
      console.log("[FFMPEG subtitles stdout]", data.toString());
    });
    child.stderr.on("data", (data) => {
      console.error("[FFMPEG subtitles stderr]", data.toString());
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ outputPath: outPath });
      } else {
        reject(new Error(`ffmpeg subtitle burn exited with code ${code}`));
      }
    });
  });
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
ipcMain.handle("tts:pickVoskJson", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select Vosk JSON transcript",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return { path: result.filePaths[0] };
});

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

  // Always convert to mono 16-bit PCM before feeding to Vosk
  const pcmPath = audioPath.replace(/\.wav$/i, "_pcm16.wav");

  await new Promise<void>((resolve, reject) => {
    const ffArgs = [
      "-y",
      "-i", audioPath,
      "-ac", "1",          // mono
      "-ar", "16000",      // 16 kHz
      "-sample_fmt", "s16",// 16-bit PCM
      pcmPath,
    ];
    const child = spawn("ffmpeg", ffArgs, { cwd: process.cwd() });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg pcm16 convert exited with code ${code}`));
    });
  });

  return new Promise<{ words: { word: string; start: number; end: number }[] }>((resolve, reject) => {
    const pythonExe = "python";
    const scriptPath = path.join(process.cwd(), "stt_vosk.py");

    execFile(pythonExe, [scriptPath, pcmPath, modelPath, outJson], { cwd: process.cwd() }, (err) => {
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
