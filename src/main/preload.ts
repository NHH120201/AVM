import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  runPipeline: (params: { topic: string; targetDuration: number; mute: boolean; maxClipSeconds: number; outputFolder: string;
  urls?: string[]; }) =>
  ipcRenderer.invoke("pipeline:run", params),
  onLog: (callback: (line: string) => void) => {
    ipcRenderer.on("pipeline:log", (_event, line: string) => callback(line));
  },
  onStep: (callback: (data: { step: string; status: string }) => void) => {
    ipcRenderer.on("pipeline:step", (_event, data) => callback(data));
  },
  saveUrlSet: (params: { catalogName: string; topic?: string | null; urls: string[] }) =>
    ipcRenderer.invoke("urlsets:save", params),
  listTopics: () => ipcRenderer.invoke("urlsets:listTopics"),
  listTopicsInFolder: (baseFolder: string) =>
    ipcRenderer.invoke("video:listTopicsInFolder", { baseFolder }),
  loadManifest: (params: { topic: string }) =>
    ipcRenderer.invoke("manifest:load", params),
  injectCaption: (params: { inputPath: string; caption?: string; font?: string; color?: string; size?: number; voskJsonPath?: string }) =>
    ipcRenderer.invoke("video:injectCaption", params),
  pickFinalVideo: () => ipcRenderer.invoke("video:pickFinal"),
  listRuns: () => ipcRenderer.invoke("video:listRuns"),
  pickFolderAndListVideos: () => ipcRenderer.invoke("video:pickFolder"),
  buildFinalFromSelected: (params: { topic: string; items: { path: string; label: string }[]; maxClipSeconds: number; maxDurationSeconds: number; narrationAudioPath?: string | null }) =>
    ipcRenderer.invoke("video:buildFinalFromSelected", params),
  ttsGenerate: (params: { text: string; outputPath?: string; promptPath?: string | null; exaggeration?: number; cfgWeight?: number }) =>
    ipcRenderer.invoke("tts:generate", params),
  ttsPickPrompt: () => ipcRenderer.invoke("tts:pickPrompt"),
  ttsTranscribe: (audioPath: string) => ipcRenderer.invoke("tts:transcribe", { audioPath }),
  ttsPickVoskJson: () => ipcRenderer.invoke("tts:pickVoskJson"),
  listGeneratedVoices: () => ipcRenderer.invoke("tts:listGenerated"),
  pickNarrationAudio: () => ipcRenderer.invoke("audio:pickFile"),
});
