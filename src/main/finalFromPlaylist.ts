import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const OUT_ROOT = "C:\\Users\\Admin\\Videos";

export interface PlaylistItem {
  path: string;
  label?: string;
}

// ─── Get real duration via ffprobe ───────────────────────────────────────────
function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=duration",
      "-of", "csv=p=0",
      filePath,
    ];
    const child = spawn("ffprobe", args, { shell: false });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code) => {
      if (code === 0) resolve(parseFloat(output.trim()) || 0);
      else reject(new Error(`ffprobe exited with code ${code}`));
    });
  });
}

// ─── Normalize to 1080×1920 (YouTube Shorts) ─────────────────────────────────
// Scale to fit within 1080×1920, pad remainder with black bars.
// Writes to a temp file then replaces the original.
function runFfmpegNormalize(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const tmpPath = path.join(dir, `${base}_norm${ext}`);

    const args = [
      "-y",
      "-i", filePath,
      "-vf", "scale=1920:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-an",
      "-movflags", "+faststart",
      tmpPath,
    ];

    const child = spawn("ffmpeg", args, { shell: false });
    child.stderr.on("data", (chunk) => console.error(`[ffmpeg normalize] ${chunk.toString()}`));
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg normalize exited with code ${code}`));
        return;
      }
      // Replace original with normalized version
      try {
        fs.unlinkSync(filePath);
        fs.renameSync(tmpPath, filePath);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ─── Copy whole clip (re-encode for consistent codec/timebase) ───────────────
function runFfmpegCopy(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-an",
      "-movflags", "+faststart",
      outputPath,
    ];
    const child = spawn("ffmpeg", args, { shell: false });
    child.stderr.on("data", (chunk) => console.error(`[ffmpeg copy] ${chunk.toString()}`));
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg copy exited with code ${code}`))
    );
  });
}

// ─── Cut a segment from startSec for durationSec ─────────────────────────────
function runFfmpegCut(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss", String(startSec),
      "-i", inputPath,
      "-t", String(durationSec),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-an",
      "-movflags", "+faststart",
      outputPath,
    ];
    const child = spawn("ffmpeg", args, { shell: false });
    child.stderr.on("data", (chunk) => console.error(`[ffmpeg cut] ${chunk.toString()}`));
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg cut exited with code ${code}`))
    );
  });
}

// ─── Concat clips from playlist.txt ──────────────────────────────────────────
function runFfmpegConcat(listFile: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c:v", "copy",
      "-an",
      "-movflags", "+faststart",
      outputPath,
    ];
    const child = spawn("ffmpeg", args, { shell: false });
    child.stderr.on("data", (chunk) => console.error(`[ffmpeg concat] ${chunk.toString()}`));
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg concat exited with code ${code}`))
    );
  });
}

// ─── Mux narration audio onto a video (shortest) ─────────────────────────────
function runFfmpegMuxAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      "-movflags", "+faststart",
      outputPath,
    ];
    const child = spawn("ffmpeg", args, { shell: false });
    child.stderr.on("data", (chunk) => console.error(`[ffmpeg mux] ${chunk.toString()}`));
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg mux exited with code ${code}`))
    );
  });
}

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Unique output path ───────────────────────────────────────────────────────
function getUniquePath(dir: string, baseName: string): string {
  const ext = path.extname(baseName);
  const name = path.basename(baseName, ext);
  let candidate = path.join(dir, baseName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name} (${counter})${ext}`);
    counter++;
  }
  return candidate;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export async function buildFinalFromPlaylist(
  topic: string,
  items: PlaylistItem[],
  secPerClip: number,
  maxDurationSec: number,
  narrationAudioPath?: string | null
): Promise<{ outputPath: string }> {
  if (!items.length) throw new Error("No playlist items provided");

  const topicSafe = (topic || "playlist").trim().toLowerCase().replace(/\s+/g, "_");
  const outDir = OUT_ROOT;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Always wipe temp dir for clean run
  const tempDir = path.join(outDir, "temp_clips");
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  interface PoolClip { path: string; durationSec: number; }
  const directClips: PoolClip[] = [];  // Rule 1 & 2 — always go in
  const randomPool: PoolClip[] = [];   // Rule 3 — randomly picked to fill time

  let fileIndex = 0;

  for (const item of items) {
    if (!fs.existsSync(item.path)) {
      console.warn(`[Pool] Skipping missing file: ${item.path}`);
      continue;
    }

    const duration = await getVideoDuration(item.path);
    const label = item.label || path.basename(item.path);
    console.log(`[Pool] "${label}" → ${duration.toFixed(2)}s`);

    if (duration < secPerClip) {
      // ── RULE 1: smaller than secPerClip → attach whole clip as-is ──────
      fileIndex++;
      const outPath = path.join(tempDir, `clip-${String(fileIndex).padStart(4, "0")}.mp4`);
      console.log(`  [Rule 1] ${duration.toFixed(2)}s < ${secPerClip}s → attach whole clip`);
      await runFfmpegCopy(item.path, outPath);
      await runFfmpegNormalize(outPath);
      directClips.push({ path: outPath, durationSec: duration });

    } else if (duration < maxDurationSec) {
      // ── RULE 2: >= secPerClip but < maxDuration → trim to secPerClip ───
      fileIndex++;
      const outPath = path.join(tempDir, `clip-${String(fileIndex).padStart(4, "0")}.mp4`);
      console.log(`  [Rule 2] ${duration.toFixed(2)}s → trim to ${secPerClip}s`);
      await runFfmpegCut(item.path, outPath, 0, secPerClip);
      await runFfmpegNormalize(outPath);
      directClips.push({ path: outPath, durationSec: secPerClip });

    } else if (duration >= maxDurationSec - 0.5) {
      // ── RULE 3: >= maxDuration (with 0.5s tolerance) → split into secPerClip chunks ───────────
      const numChunks = Math.floor(duration / secPerClip);
      console.log(`  [Rule 3] ${duration.toFixed(2)}s → split into ${numChunks} × ${secPerClip}s chunks`);
      for (let chunk = 0; chunk < numChunks; chunk++) {
        fileIndex++;
        const startSec = chunk * secPerClip;
        const outPath = path.join(tempDir, `clip-${String(fileIndex).padStart(4, "0")}.mp4`);
        await runFfmpegCut(item.path, outPath, startSec, secPerClip);
        await runFfmpegNormalize(outPath);
        randomPool.push({ path: outPath, durationSec: secPerClip });
        console.log(`    Chunk ${chunk + 1}/${numChunks} [${startSec}s–${startSec + secPerClip}s]`);
      }
    }
  }

  // Shuffle Rule 3 pool then fill remaining time after direct clips
  const shuffledPool = shuffle(randomPool);
  let totalSec = directClips.reduce((sum, c) => sum + c.durationSec, 0);
  const finalClips: PoolClip[] = [...directClips];

  console.log(`[Build] Direct clips: ${directClips.length} (${totalSec.toFixed(2)}s) | Random pool: ${shuffledPool.length} chunks`);

  const MIN_LAST_CLIP_SEC = 5;
  for (const clip of shuffledPool) {
    if (totalSec >= maxDurationSec) break;

    const remaining = maxDurationSec - totalSec;

    if (remaining < MIN_LAST_CLIP_SEC) {
      console.log(`[Build] Stopping early — only ${remaining.toFixed(2)}s left, below ${MIN_LAST_CLIP_SEC}s minimum`);
      break;
    }

    if (totalSec + clip.durationSec > maxDurationSec) {
      // Chunk would overshoot — trim to exactly fill remaining time
      fileIndex++;
      const trimmedPath = path.join(tempDir, `clip-${String(fileIndex).padStart(4, "0")}.mp4`);
      console.log(`[Build] Last chunk: trimming ${clip.durationSec}s → ${remaining.toFixed(2)}s`);
      await runFfmpegCut(clip.path, trimmedPath, 0, remaining);
      await runFfmpegNormalize(trimmedPath);
      finalClips.push({ path: trimmedPath, durationSec: remaining });
      totalSec += remaining;
    } else {
      // Fits fine — already normalized when it was created
      finalClips.push(clip);
      totalSec += clip.durationSec;
    }

    console.log(`[Build] +${clip.durationSec}s → ${totalSec.toFixed(2)}s / ${maxDurationSec}s`);
  }

  console.log(`[Build] Final: ${finalClips.length} clips → ~${totalSec.toFixed(2)}s`);
  if (!finalClips.length) throw new Error("Nothing to concat");

  // Write playlist.txt
  const lines = finalClips.map((c) => {
    const normalized = c.path.replace(/\\/g, "/");
    return `file '${normalized.replace(/'/g, "'\\''")}'`;
  });
  const listFile = path.join(outDir, "playlist.txt");
  if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
  fs.writeFileSync(listFile, lines.join("\n"), "utf8");

  const baseOutputPath = getUniquePath(outDir, `${topicSafe}_playlist.mp4`);
  await runFfmpegConcat(listFile, baseOutputPath);

  let finalOutputPath = baseOutputPath;

  // Optionally mux narration audio if provided
  if (narrationAudioPath && fs.existsSync(narrationAudioPath)) {
    const muxedPath = getUniquePath(outDir, `${topicSafe}_playlist_with_audio.mp4`);
    console.log(`[Build] Muxing narration audio: ${narrationAudioPath}`);
    try {
      await runFfmpegMuxAudio(baseOutputPath, narrationAudioPath, muxedPath);
      finalOutputPath = muxedPath;
    } catch (err) {
      console.error("[Build] Failed to mux narration audio:", err);
      finalOutputPath = baseOutputPath;
    }
  }

  // Write metadata
  try {
    fs.writeFileSync(
      finalOutputPath.replace(/\.mp4$/i, ".meta.json"),
      JSON.stringify({
        videoPath: finalOutputPath,
        topic: topicSafe,
        secPerClip,
        maxDurationSec,
        actualDurationSec: totalSec,
        clipCount: finalClips.length,
        createdAt: new Date().toISOString(),
        sources: items.map((i) => i.path),
        narrationAudioPath: narrationAudioPath || null,
      }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Failed to write meta:", err);
  }

  return { outputPath: finalOutputPath };
}
