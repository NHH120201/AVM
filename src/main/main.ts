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
import { exportTimeline, TimelineClip as EditorTimelineClip } from "./exportTimeline";
import { probeMedia } from "./mediaProbe";

const VENV_PYTHON = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\.venv\\Scripts\\python.exe";
const AVM_ROOT    = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM";

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
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      autoplayPolicy: "no-user-gesture-required",
    }
  });
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
  Menu.setApplicationMenu(null);
}

function setupMenu() {
  const template = [
    { label: "File", submenu: [{ role: "quit" }] },
    {
      label: "Edit",
      submenu: [
        { label: "Window size: Small (960×600)",  click: () => { if (mainWindow) mainWindow.setSize(960, 600); } },
        { label: "Window size: Medium (1280×720)", click: () => { if (mainWindow) mainWindow.setSize(1280, 720); } },
        { label: "Window size: Large (1600×900)",  click: () => { if (mainWindow) mainWindow.setSize(1600, 900); } }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "toggledevtools" }, { type: "separator" },
        { role: "resetzoom" }, { role: "zoomin" }, { role: "zoomout" },
        { type: "separator" }, { role: "togglefullscreen" }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ── Pipeline ─────────────────────────────────────────────────────────────────
ipcMain.handle("pipeline:run", async (event, args: {
  topic: string; targetDuration: number; mute: boolean;
  maxClipSeconds: number; outputFolder: string; urls?: string[];
}) => {
  const webContents = event.sender;
  const onLog  = (line: string)            => { webContents.send("pipeline:log",  line); };
  const onStep = (step: string, status: string) => { webContents.send("pipeline:step", { step, status }); };
  return await runPipeline({
    topic: args.topic, targetDuration: args.targetDuration, mute: args.mute,
    maxClipSeconds: args.maxClipSeconds, outputFolder: args.outputFolder,
    urls: args.urls, onLog, onStep
  });
});

ipcMain.handle("urlsets:save", async (_event, args: { catalogName: string; topic?: string | null; urls: string[] }) => {
  return saveUrlSet(args.catalogName, args.topic ?? null, args.urls);
});
ipcMain.handle("urlsets:listTopics", async () => listTopics());

ipcMain.handle("video:listTopicsInFolder", async (_event, args: { baseFolder: string }) => {
  try {
    const entries = fs.readdirSync(args.baseFolder, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch { return []; }
});

ipcMain.handle("manifest:load", async (_event, args: { topic: string }) => {
  const manifest = loadLatestManifest(args.topic);
  if (!manifest) return null;
  return { videos: manifest.videos };
});

// ── ASS Subtitle Builder ──────────────────────────────────────────────────────
function buildAssFromVoskJson(
  voskJsonPath: string,
  opts: { font?: string; size?: number; color?: string; position?: "bottom"|"middle"|"top" }
): string {
  const words: { word: string; start: number; end: number }[] =
    Array.isArray(JSON.parse(fs.readFileSync(voskJsonPath, "utf8")).words)
      ? JSON.parse(fs.readFileSync(voskJsonPath, "utf8")).words : [];
  const OFFSET = 0.21;
  const chunks: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += 3) {
    const slice = words.slice(i, i + 3); if (!slice.length) continue;
    const startRaw = slice[0].start ?? 0;
    const endRaw   = slice[slice.length-1].end ?? startRaw + 1;
    chunks.push({ start: Math.max(0, startRaw-OFFSET), end: Math.max(startRaw-OFFSET+0.1, endRaw-OFFSET), text: slice.map(w=>w.word).join(" ") });
  }
  const fmt = (sec: number) => {
    if (!isFinite(sec)||sec<0) sec=0;
    const pad = (n:number,w:number)=>String(n).padStart(w,"0");
    return `${Math.floor(sec/3600)}:${pad(Math.floor((sec%3600)/60),2)}:${pad(Math.floor(sec%60),2)}.${pad(Math.floor((sec-Math.floor(sec))*100),2)}`;
  };
  const toColor = (c?: string) => {
    const l=(c||"").toLowerCase().trim(); let r=255,g=255,b=255;
    if(l==="yellow"){r=255;g=255;b=0;} else if(l==="cyan"){r=0;g=255;b=255;}
    else if(l.startsWith("#")&&l.length===7){r=parseInt(l.slice(1,3),16);g=parseInt(l.slice(3,5),16);b=parseInt(l.slice(5,7),16);}
    const h=(n:number)=>Math.max(0,Math.min(255,n|0)).toString(16).padStart(2,"0");
    return `&H00${h(b)}${h(g)}${h(r)}`;
  };
  const alignment = opts.position==="top"?8:opts.position==="middle"?5:2;
  const lines = [
    "[Script Info]","ScriptType: v4.00+","",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${opts.font?.trim()||"Segoe UI"},${(opts.size&&opts.size>0)?opts.size:40},${toColor(opts.color)},&H00000000,&H64000000,0,0,1,2,2,${alignment},10,10,40,1`,
    "","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...chunks.map(c=>`Dialogue: 0,${fmt(c.start)},${fmt(c.end)},Default,,0,0,0,,${c.text}`)
  ];
  const assPath = voskJsonPath.replace(/\.vosk\.json$/i,"")+".ass";
  fs.writeFileSync(assPath, lines.join("\n"), "utf8");
  return assPath;
}

// ── Inject Caption ────────────────────────────────────────────────────────────
ipcMain.handle("video:injectCaption", async (_event, args: {
  inputPath: string; caption?: string; font?: string; color?: string; size?: number; voskJsonPath?: string;
}) => {
  if (!fs.existsSync(args.inputPath)) throw new Error(`Input video not found: ${args.inputPath}`);
  if (!args.voskJsonPath || !fs.existsSync(args.voskJsonPath)) return { outputPath: args.inputPath };
  const assPath = buildAssFromVoskJson(args.voskJsonPath, { font: args.font, size: args.size, color: args.color });
  const ext = path.extname(args.inputPath) || ".mp4";
  const base = path.basename(args.inputPath, ext);
  let outPath = path.join(path.dirname(args.inputPath), `${base}_subbed${ext}`);
  let idx = 1;
  while (fs.existsSync(outPath)) { outPath = path.join(path.dirname(args.inputPath), `${base}_subbed (${idx})${ext}`); idx++; }
  return await new Promise<{ outputPath: string }>((resolve, reject) => {
    const inner = assPath.replace(/\\/g,"/").replace(/:/g,"\\:").replace(/ /g,"\\ ").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
    const child = spawn("ffmpeg", ["-y","-i",args.inputPath,"-vf",`subtitles='${inner}'`,"-c:a","copy",outPath], { cwd: AVM_ROOT });
    child.stdout.on("data",(d)=>console.log("[FFMPEG stdout]",d.toString()));
    child.stderr.on("data",(d)=>console.error("[FFMPEG stderr]",d.toString()));
    child.on("exit",(code)=>{ if(code===0) resolve({outputPath:outPath}); else reject(new Error(`ffmpeg exited ${code}`)); });
  });
});

// ── Pickers ───────────────────────────────────────────────────────────────────
ipcMain.handle("video:pickFinal", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, { title:"Select final video", properties:["openFile"], filters:[{name:"Video",extensions:["mp4","mov","mkv"]}] });
  return r.canceled||!r.filePaths.length ? null : { path: r.filePaths[0] };
});
ipcMain.handle("tts:pickPrompt", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title:"Select voice sample (WAV)", defaultPath:`${AVM_ROOT}\\Audio\\VoiceSample`, properties:["openFile"],
    filters:[{name:"Audio",extensions:["mp3","wav","flac","aac","aiff","ogg","m4a","wma"]}]
  });
  return r.canceled||!r.filePaths.length ? null : { path: r.filePaths[0] };
});
ipcMain.handle("tts:pickVoskJson", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title:"Select Vosk JSON transcript", defaultPath:`${AVM_ROOT}\\Audio\\Subtitles`,
    properties:["openFile"], filters:[{name:"JSON",extensions:["json"]}]
  });
  return r.canceled||!r.filePaths.length ? null : { path: r.filePaths[0] };
});
ipcMain.handle("audio:pickFile", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, { title:"Select narration audio", properties:["openFile"], filters:[{name:"Audio",extensions:["wav","mp3","flac","ogg","m4a"]}] });
  return r.canceled||!r.filePaths.length ? null : { path: r.filePaths[0] };
});
ipcMain.handle("download:pickTargetFolder", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, { title:"Select download target folder", properties:["openDirectory","createDirectory"] });
  return r.canceled||!r.filePaths.length ? null : { folder: r.filePaths[0] };
});
ipcMain.handle("video:pickFolder", async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    title:"Select video files", buttonLabel:"Add to Bin", properties:["openFile","multiSelections"],
    filters:[{name:"Video & Audio",extensions:["mp4","mov","mkv","avi","wmv","flv","wav","mp3"]}]
  });
  if (r.canceled || !r.filePaths.length) return null;

  const folder = path.dirname(r.filePaths[0]);
  const metas = [] as { path: string; hasAudio: boolean; durationSec: number | null }[];
  for (const p of r.filePaths) {
    try {
      const meta = await probeMedia(p, AVM_ROOT);
      metas.push({ path: meta.path, hasAudio: meta.hasAudio, durationSec: meta.durationSec });
    } catch {
      metas.push({ path: p, hasAudio: true, durationSec: null });
    }
  }

  return { folder, files: metas };
});

// ── List helpers ──────────────────────────────────────────────────────────────
ipcMain.handle("video:listRuns", async () => listRuns());

ipcMain.handle("tts:listGenerated", async () => {
  try {
    const outDir = `${AVM_ROOT}\\Audio\\VoiceGenerated`;
    const wavs = fs.readdirSync(outDir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.toLowerCase().endsWith(".wav"))
      .map(f => ({ label: f.name, path: path.join(outDir, f.name) }));
    wavs.sort((a,b) => a.label.localeCompare(b.label));
    return wavs;
  } catch { return []; }
});

ipcMain.handle("fonts:listLocal", async () => {
  try {
    const dir = `${AVM_ROOT}\\Tools\\Fonts`;
    if (!fs.existsSync(dir)) return [] as string[];
    const names = fs.readdirSync(dir, { withFileTypes: true })
      .filter(f => f.isFile() && /\.(ttf|otf)$/i.test(f.name))
      .map(f => f.name.replace(/\.(ttf|otf)$/i, ""))
      .map(n => n.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
  } catch {
    return [] as string[];
  }
});

ipcMain.handle("video:listVideosInFolder", async (_event, args: { baseFolder: string }) => {
  let files: string[] = [];
  try {
    const exts = [".mp4",".mov",".mkv",".avi",".wmv",".flv"];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && exts.some(x => e.name.toLowerCase().endsWith(x))) files.push(full);
      }
    };
    walk(args.baseFolder);
  } catch { files = []; }
  return { folder: args.baseFolder, files };
});

// ── Build Final Video ─────────────────────────────────────────────────────────
ipcMain.handle("video:buildFinalFromSelected", async (_event, args) => {
  const { topic, items, maxClipSeconds, maxDurationSeconds, narrationAudioPath, trimToNarration } = args as {
    topic: string; items: PlaylistItem[]; maxClipSeconds: number;
    maxDurationSeconds: number; narrationAudioPath?: string|null; trimToNarration?: boolean;
  };
  return buildFinalFromPlaylist(topic, items, maxClipSeconds, maxDurationSeconds, narrationAudioPath, trimToNarration !== false);
});

// ── Timeline Export (multi-clip concat using Video 1 track) ──────────────────
ipcMain.handle("video:exportTimeline", async (_event, rawArgs: any) => {
  const {
    clips,
    outputFolder,
    title,
    resolution,
    codec,
    fps,
    sampleRate,
    audioChannels,
    textClips,
  } = rawArgs as {
    clips: EditorTimelineClip[];
    outputFolder: string;
    title?: string;
    resolution?: string;
    codec?: string;
    fps?: string;
    sampleRate?: string;
    audioChannels?: "stereo" | "mono" | string;
    textClips?: any[];
  };

  if (!clips || clips.length === 0) {
    throw new Error("No clips provided for export.");
  }

  return exportTimeline({
    clips,
    textClips,
    outputFolder,
    title,
    resolution,
    codec,
    fps,
    sampleRate,
    audioChannels,
    avmRoot: AVM_ROOT,
  });
});

// ── Vosk STT ──────────────────────────────────────────────────────────────────
ipcMain.handle("tts:transcribe", async (_event, args: { audioPath: string }) => {
  const { audioPath } = args;
  const modelPath = `${AVM_ROOT}\\Tools\\vosk-model-en-us-0.42-gigaspeech`;
  if (!fs.existsSync(audioPath))  throw new Error(`Audio file not found: ${audioPath}`);
  if (!fs.existsSync(modelPath))  throw new Error(`Vosk model not found: ${modelPath}`);
  const outJson  = `${AVM_ROOT}\\Audio\\Subtitles\\${path.basename(audioPath).replace(/\.wav$/i,"")}.vosk.json`;
  const pcmPath  = audioPath.replace(/\.wav$/i, "_pcm16.wav");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y","-i",audioPath,"-ac","1","-ar","16000","-sample_fmt","s16",pcmPath], { cwd: AVM_ROOT });
    child.on("exit", code => code===0 ? resolve() : reject(new Error(`ffmpeg pcm16 exited ${code}`)));
  });
  return new Promise<{ words: { word: string; start: number; end: number }[] }>((resolve, reject) => {
    // ✅ FIXED: uses stt_vosk.py not tts_qwen.py
    const scriptPath = `${AVM_ROOT}\\stt_vosk.py`;
    execFile(VENV_PYTHON, [scriptPath, pcmPath, modelPath, outJson], { cwd: AVM_ROOT }, (err) => {
      if (err) { console.error("[STT] Failed:", err); reject(err); return; }
      try {
        const parsed = JSON.parse(fs.readFileSync(outJson, "utf8"));
        resolve({ words: Array.isArray(parsed.words) ? parsed.words : [] });
      } catch(e) { reject(e); }
    });
  });
});

// ── Chatterbox TTS ────────────────────────────────────────────────────────────
ipcMain.handle("tts:generate", async (_event, args: {
  text: string; outputPath?: string; promptPath?: string|null; exaggeration?: number; cfgWeight?: number;
}) => {
  const { text, outputPath, promptPath, exaggeration, cfgWeight } = args;
  let outPath = outputPath?.trim().length ? outputPath : `${AVM_ROOT}\\Audio\\VoiceGenerated\\tts-output.wav`;
  if (!outputPath?.trim().length) {
    const dir = path.dirname(outPath); const base = path.basename(outPath, ".wav"); let idx = 1;
    while (fs.existsSync(outPath)) { outPath = `${dir}\\${base} (${idx}).wav`; idx++; }
  }
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  return new Promise<{ outputPath: string }>((resolve, reject) => {
    // ✅ FIXED: uses absolute path for chatterbox script
    const scriptPath = `${AVM_ROOT}\\tts_chatterbox_turbo.py`;
    const argsList = [scriptPath, text, outPath];
    if (promptPath?.trim().length) argsList.push("--prompt", promptPath);
    if (typeof exaggeration === "number") argsList.push("--exaggeration", String(exaggeration));
    if (typeof cfgWeight   === "number") argsList.push("--cfg_weight",   String(cfgWeight));
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (!env.HF_TOKEN) {
      try {
        const t = fs.readFileSync(`${AVM_ROOT}\\hf_token.txt`, "utf8").trim();
        if (t) env["HF_TOKEN"] = t;
      } catch {}
    }
    const child = spawn(VENV_PYTHON, argsList, { cwd: AVM_ROOT, env });
    child.stdout.on("data",(d)=>console.log("[TTS stdout]",d.toString()));
    child.stderr.on("data",(d)=>console.error("[TTS stderr]",d.toString()));
    child.on("exit", code => code===0 ? resolve({outputPath:outPath}) : reject(new Error(`TTS exited ${code}`)));
  });
});

// ── Whisper Auto-Subtitles ────────────────────────────────────────────────────
ipcMain.handle("whisper:transcribe", async (_event, args: { videoPath: string; language?: string }) => {
  const { videoPath, language } = args;
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
  const tmpDir = `${AVM_ROOT}\\Audio\\WhisperTmp`;
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const whisperArgs = ["-m","whisper", videoPath, "--output_format","json", "--output_dir",tmpDir, "--model","medium", "--word_timestamps", "True"];
  if (language && language !== "auto") whisperArgs.push("--language", language);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(VENV_PYTHON, whisperArgs, { cwd: AVM_ROOT });
    child.stdout.on("data",(d)=>console.log("[Whisper]",d.toString()));
    child.stderr.on("data",(d)=>console.error("[Whisper]",d.toString()));
    child.on("exit", code => code===0 ? resolve() : reject(new Error(`Whisper exited ${code}`)));
  });
  const jsonPath = path.join(tmpDir, `${path.basename(videoPath, path.extname(videoPath))}.json`);
  if (!fs.existsSync(jsonPath)) throw new Error(`Whisper output not found: ${jsonPath}`);
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  return {
    segments: (raw.segments||[]).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: (seg.text||"").trim(),
      words: Array.isArray(seg.words)
        ? seg.words
            .filter((w: any) => typeof w?.start === "number" && typeof w?.end === "number")
            .map((w: any) => ({
              start: w.start,
              end: w.end,
              word: (w.word || "").trim(),
            }))
        : [],
    }))
  };
});

// ── Qwen3-TTS ─────────────────────────────────────────────────────────────────
ipcMain.handle("qwen:tts", async (_event, args: {
  text: string; voice: string; instruct?: string; outputPath?: string;
}) => {
  const { text, voice, instruct, outputPath } = args;
  const outDir = `${AVM_ROOT}\\Audio\\VoiceGenerated`;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  let outPath = outputPath || path.join(outDir, "qwen-tts-output.wav");
  if (!outputPath) {
    const base = path.join(outDir, "qwen-tts-output"); let idx = 1;
    while (fs.existsSync(outPath)) { outPath = `${base} (${idx}).wav`; idx++; }
  }
  // Write args to temp file — avoids Windows JSON quote issues
  const tmpArgFile = path.join(outDir, "_qwen_args.json");
  fs.writeFileSync(tmpArgFile, JSON.stringify({ text, voice, instruct: instruct||"", output: outPath }), "utf8");
  // ✅ FIXED: absolute path to tts_qwen.py
  const scriptPath = `${AVM_ROOT}\\tts_qwen.py`;
  return new Promise<{ outputPath: string; durationSec: number | null }>((resolve, reject) => {
    const child = spawn(VENV_PYTHON, [scriptPath, tmpArgFile], { cwd: AVM_ROOT });
    child.stdout.on("data",(d)=>console.log("[QwenTTS]",d.toString()));
    child.stderr.on("data",(d)=>console.error("[QwenTTS]",d.toString()));
    child.on("exit", async code => {
      try { fs.unlinkSync(tmpArgFile); } catch {}
      if (code!==0) {
        reject(new Error(`Qwen TTS exited ${code}`));
        return;
      }
      try {
        const meta = await probeMedia(outPath, AVM_ROOT);
        resolve({ outputPath: outPath, durationSec: meta.durationSec ?? null });
      } catch (e) {
        console.error("[QwenTTS] probeMedia failed", e);
        resolve({ outputPath: outPath, durationSec: null });
      }
    });
  });
});