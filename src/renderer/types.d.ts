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

declare global {
  interface Window {
    api: {
      runPipeline: (
        params: {
           topic: string; targetDuration: number; urls?: string[]; mute: boolean; maxClipSeconds: number; outputFolder: string }) => Promise<{
      finalPath: string;
      reportPath: string;
    }>;
      onLog: (cb: (line: string) => void) => void;
      onStep: (cb: (data: { step: string; status: string }) => void) => void;
      saveUrlSet: (params: { catalogName: string; topic?: string | null; urls: string[] }) => Promise<any>;
      listTopics: () => Promise<string[]>;
      loadManifest: (params: { topic: string }) => Promise<{ videos: ManifestVideo[] } | null>;
      injectCaption: (params: { inputPath: string; caption: string; font: string; color: string; size: number }) => Promise<{ outputPath: string }>;
      pickFinalVideo: () => Promise<{ path: string } | null>;
      listRuns: () => Promise<RunInfo[]>;
      pickFolderAndListVideos: () => Promise<{ folder: string; files: string[] } | null>;
      buildFinalFromSelected: (params: { topic: string; items: { path: string; label: string }[]; maxClipSeconds: number; maxDurationSeconds: number }) => Promise<{ outputPath: string }>;
    };
  }
}

export {};
