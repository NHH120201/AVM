import { spawn } from "child_process";

export interface MediaMeta {
  path: string;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number | null;
}

export function probeMedia(path: string, cwd: string): Promise<MediaMeta> {
  return new Promise((resolve) => {
    const args = [
      "-v","error",
      "-show_streams",
      "-show_format",
      "-print_format","json",
      path,
    ];

    const child = spawn("ffprobe", args, { cwd });
    let out = "";
    let err = "";

    child.stdout.on("data", d => { out += d.toString(); });
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("exit", code => {
      if (code !== 0) {
        console.error("[ffprobe]", err || `ffprobe exited with code ${code}`);
        return resolve({
          path,
          hasVideo: true,
          hasAudio: true,
          durationSec: null,
        });
      }
      try {
        const json = JSON.parse(out);
        const streams = Array.isArray(json.streams) ? json.streams : [];
        const hasVideo = streams.some((s: any) => s.codec_type === "video");
        const hasAudio = streams.some((s: any) => s.codec_type === "audio");
        const durRaw = json.format?.duration;
        const durationSec = typeof durRaw === "string" ? parseFloat(durRaw) : null;
        resolve({ path, hasVideo, hasAudio, durationSec: Number.isFinite(durationSec) ? durationSec : null });
      } catch (e) {
        console.error("[ffprobe parse]", e);
        resolve({
          path,
          hasVideo: true,
          hasAudio: true,
          durationSec: null,
        });
      }
    });
  });
}
