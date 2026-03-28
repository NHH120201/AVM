import type { TimelineClip, TextClip, TransitionClip, ElementClip } from "./VideoEditor";

export interface ManifestVideo {
  url: string | null;
  localPath: string;
  durationSec: number;
  resolution?: string;
}

export interface RunInfo {
  topic: string;
  date: string;
  editedFiles: string[];
}

export interface GeneratedVoiceInfo {
  label: string;
  path: string;
}

export type NarrationMode = "none" | "generated" | "manual";

export interface ExportTimelineParams {
  clips: TimelineClip[];
  textClips?: TextClip[];
  transitions?: TransitionClip[];
  elements?: ElementClip[];
  outputFolder: string;
  quality: "draft" | "good" | "high";
  resolution: string; // e.g. "1080x1920"
  title: string;
  codec?: string;
  fps?: string;
  sampleRate?: string;
  audioChannels?: "stereo" | "mono";
}

declare global {
  interface Window {
    api: {
      runPipeline: (params: {
        topic: string;
        targetDuration: number;
        urls?: string[];
        mute: boolean;
        maxClipSeconds: number;
        outputFolder: string;
      }) => Promise<{
        finalPath: string | null;
        reportPath: string | null;
      }>;
      onLog: (cb: (line: string) => void) => void;
      onStep: (cb: (data: { step: string; status: string }) => void) => void;
      saveUrlSet: (params: {
        catalogName: string;
        topic?: string | null;
        urls: string[];
      }) => Promise<any>;
      listTopics: () => Promise<string[]>;
      loadManifest: (params: {
        topic: string;
      }) => Promise<{ videos: ManifestVideo[] } | null>;

      // Caption / subtitles
      injectCaption: (params: {
        inputPath: string;
        voskJsonPath: string;
        font: string;
        color: string;
        size: number;
        position: "bottom" | "middle" | "top";
      }) => Promise<{ outputPath: string }>;

      // Final video selection
      pickFinalVideo: () => Promise<{ path: string } | null>;

      // History
      listRuns: () => Promise<RunInfo[]>;

      // Folders / media listing
      pickTargetFolder: () => Promise<{ folder: string } | null>;
      pickFolderAndListVideos: () => Promise<{
        folder: string;
        files: { path: string; hasAudio: boolean; durationSec: number | null }[];
      } | null>;
      listTopicsInFolder?: (folder: string) => Promise<string[]>;
      listVideosInFolder?: (folder: string) => Promise<{ files: string[] }>;

      // Classic builder
      buildFinalFromSelected: (params: {
        topic: string;
        items: { path: string; label: string }[];
        maxClipSeconds: number;
        maxDurationSeconds: number;
        narrationAudioPath?: string | null;
        trimToNarration?: boolean;
      }) => Promise<{ outputPath: string }>;

      // TTS / STT helpers used in App
      ttsGenerate?: (params: {
        text: string;
        outputPath: string;
        promptPath: string | null;
        exaggeration: number;
        cfgWeight: number;
      }) => Promise<{ outputPath: string }>;
      ttsTranscribe?: (audioPath: string) => Promise<void>;
      ttsPickPrompt?: () => Promise<{ path: string } | null>;
      ttsPickVoskJson?: () => Promise<{ path: string } | null>;
      listGeneratedVoices?: () => Promise<GeneratedVoiceInfo[]>;
      pickNarrationAudio?: () => Promise<{ path: string } | null>;

      // Editor audio helpers
      whisperTranscribe?: (params: {
        videoPath: string;
        language?: string;
      }) => Promise<{ segments: { start: number; end: number; text: string }[] }>;
      qwenTts?: (params: {
        text: string;
        voice: string;
        instruct?: string;
      }) => Promise<{ outputPath: string; durationSec: number | null }>;

      // Export pipeline
      exportTimeline?: (params: ExportTimelineParams) => Promise<{
        outputPath: string;
      }>;
    };
  }
}

export {};
