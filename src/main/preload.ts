import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  runPipeline: (params: { topic: string; targetDuration: number; mute: boolean; maxClipSeconds: number; outputFolder: string; urls?: string[]; }) =>
    ipcRenderer.invoke("pipeline:run", params),

  onLog: (callback: (line: string) => void) => {
    // Remove any previous listener before adding a new one to prevent accumulation
    // on repeated calls (e.g. if App remounts in hot-reload or test scenarios).
    ipcRenderer.removeAllListeners("pipeline:log");
    ipcRenderer.on("pipeline:log", (_event, line: string) => callback(line));
  },

  onStep: (callback: (data: { step: string; status: string }) => void) => {
    ipcRenderer.removeAllListeners("pipeline:step");
    ipcRenderer.on("pipeline:step", (_event, data) => callback(data));
  },

  saveUrlSet: (params: { catalogName: string; topic?: string | null; urls: string[] }) =>
    ipcRenderer.invoke("urlsets:save", params),

  listTopics: () => ipcRenderer.invoke("urlsets:listTopics"),

  listTopicsInFolder: (baseFolder: string) =>
    ipcRenderer.invoke("video:listTopicsInFolder", { baseFolder }),

  loadManifest: (params: { topic: string }) =>
    ipcRenderer.invoke("manifest:load", params),

  injectCaption: (params: { inputPath: string; caption?: string; font?: string; color?: string; size?: number; voskJsonPath?: string; position?: string }) =>
    ipcRenderer.invoke("video:injectCaption", params),

  pickFinalVideo: () => ipcRenderer.invoke("video:pickFinal"),

  listRuns: () => ipcRenderer.invoke("video:listRuns"),

  // File picker — for Add Clips in Video Editor (opens file picker, returns selected files)
  pickFolderAndListVideos: () => ipcRenderer.invoke("video:pickFolder"),

  // Folder picker — for Download Target Folder / Local Folder in App (opens folder picker, returns folder path)
  pickTargetFolder: () => ipcRenderer.invoke("download:pickTargetFolder"),

  // List videos under a given folder (no dialog)
  listVideosInFolder: (baseFolder: string) => ipcRenderer.invoke("video:listVideosInFolder", { baseFolder }),

  buildFinalFromSelected: (params: { topic: string; items: { path: string; label: string }[]; maxClipSeconds: number; maxDurationSeconds: number; narrationAudioPath?: string | null; trimToNarration?: boolean }) =>
    ipcRenderer.invoke("video:buildFinalFromSelected", params),

  ttsGenerate: (params: { text: string; outputPath?: string; promptPath?: string | null; exaggeration?: number; cfgWeight?: number }) =>
    ipcRenderer.invoke("tts:generate", params),

  ttsPickPrompt: () => ipcRenderer.invoke("tts:pickPrompt"),

  ttsTranscribe: (audioPath: string) => ipcRenderer.invoke("tts:transcribe", { audioPath }),

  ttsPickVoskJson: () => ipcRenderer.invoke("tts:pickVoskJson"),

  listGeneratedVoices: () => ipcRenderer.invoke("tts:listGenerated"),

  listLocalFonts: () => ipcRenderer.invoke("fonts:listLocal"),

  pickNarrationAudio: () => ipcRenderer.invoke("audio:pickFile"),

  whisperTranscribe: (args: { videoPath: string; language?: string }) =>
    ipcRenderer.invoke("whisper:transcribe", args),

  qwenTts: (args: { text: string; voice: string; instruct?: string; outputPath?: string }) =>
    ipcRenderer.invoke("qwen:tts", args),

  exportTimeline: (params: any) =>
    ipcRenderer.invoke("video:exportTimeline", params),

  openOutputFolder: (folderPath: string) =>
    ipcRenderer.invoke("shell:openFolder", folderPath),
});