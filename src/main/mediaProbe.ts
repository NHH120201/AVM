import { spawn } from "child_process";

export interface MediaMeta {
  path: string;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number | null;
}

export function probeMedia(filePath: string, cwd: string): Promise<MediaMeta> {
  return new Promise((resolve) => {
    const args = [
      "-v","error",
      "-show_streams",
      "-show_format",
      "-print_format","json",
      filePath,
    ];

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("ffprobe", args, { cwd });
    } catch (spawnErr) {
      // ffprobe not found or spawn failed — return safe defaults
      console.error("[ffprobe spawn error]", spawnErr);
      return resolve({ path: filePath, hasVideo: true, hasAudio: false, durationSec: null });
    }

    let out = "";
    let err = "";

    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });

    // Handle ENOENT / spawn errors (ffprobe not in PATH)
    child.on("error", (e: Error) => {
      console.error("[ffprobe error]", e.message);
      resolve({ path: filePath, hasVideo: true, hasAudio: false, durationSec: null });
    });

    child.on("exit", (code: number | null) => {
      if (code !== 0) {
        console.error("[ffprobe]", err || `ffprobe exited with code ${code}`);
        // Return conservative defaults: assume video present, audio unknown → false (safer for export)
        return resolve({
          path: filePath,
          hasVideo: true,
          hasAudio: false,
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
        resolve({ path: filePath, hasVideo, hasAudio, durationSec: Number.isFinite(durationSec as number) ? durationSec as number : null });
      } catch (e) {
        console.error("[ffprobe parse]", e);
        resolve({
          path: filePath,
          hasVideo: true,
          hasAudio: false,
          durationSec: null,
        });
      }
    });
  });
}
