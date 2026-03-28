import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export interface ClipEffects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  vignette?: number;
  filmGrain?: number;
  lut?: string;
}

export interface TimelineClip {
  id: string;
  path: string;
  label: string;
  durationSec: number;
  startSec: number;
  trimStart: number;
  trimEnd: number;
  track: number; // 0 = Video 1, 1 = Audio 1, others = extra
  color: string;
  speed?: number;
  clipVolume?: number;
  fadeIn?: number;
  fadeOut?: number;
  effects?: ClipEffects;
}

export interface ExportTimelineOptions {
  clips: TimelineClip[];
  textClips?: any[]; // TextClip[] from renderer; kept loose here to avoid tight coupling
  outputFolder: string;
  title?: string;
  resolution?: string; // e.g. "1080x1920"
  codec?: string; // "H.264" | "H.265" | "VP9"
  fps?: string;
  sampleRate?: string; // "44100" | "48000"
  audioChannels?: "stereo" | "mono" | string;
  quality?: "draft" | "good" | "high"; // maps to CRF value
  avmRoot: string;
}

/**
 * Simple V1 exporter:
 * - Uses only track 0 (Video 1) clips
 * - Concatenates their video+audio segments in order with trimStart/trimEnd
 * - Applies scale + fps + codec + audio params on the final output
 */
export async function exportTimeline(opts: ExportTimelineOptions): Promise<{ outputPath: string }> {
  const {
    clips,
    textClips,
    outputFolder,
    title,
    resolution,
    codec,
    fps,
    sampleRate,
    audioChannels,
    quality,
    avmRoot,
  } = opts;

  const videoClips = (clips || [])
    .filter(c => c.track === 0)
    .sort((a, b) => a.startSec - b.startSec);

  const audioTrackClips = (clips || [])
    .filter(c => c.track === 1)
    .sort((a, b) => a.startSec - b.startSec);

  if (!videoClips.length) {
    throw new Error("No Video 1 clips found in timeline.");
  }

  // Validate files and build segments for Video 1
  const videoSegments = videoClips.map(c => {
    if (!c.path || !fs.existsSync(c.path)) {
      throw new Error(`Source file missing for clip: ${c.label} (${c.path})`);
    }
    const inSec = Math.max(0, c.trimStart);
    const outSec = Math.max(inSec + 0.1, c.durationSec - c.trimEnd);
    const len = outSec - inSec;
    return { path: c.path, inSec, len };
  });

  // Optional segments for Audio 1 track (track 1)
  const audioSegments = audioTrackClips.map(c => {
    if (!c.path || !fs.existsSync(c.path)) {
      throw new Error(`Source file missing for audio clip: ${c.label} (${c.path})`);
    }
    const inSec = Math.max(0, c.trimStart);
    const outSec = Math.max(inSec + 0.1, c.durationSec - c.trimEnd);
    const len = outSec - inSec;
    return { path: c.path, inSec, len, startSec: c.startSec };
  });

  // Ensure output folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const safeTitle = (title || "export").replace(/[^\w\-]+/g, "_");
  // Always use .mp4 container regardless of source extension; it is compatible with all supported codecs.
  const ext = ".mp4";
  const baseOut = path.join(outputFolder, `${safeTitle}${ext}`);
  let outputPath = baseOut;
  let idx = 1;
  while (fs.existsSync(outputPath)) {
    outputPath = path.join(outputFolder, `${safeTitle} (${idx})${ext}`);
    idx++;
  }

  // Parse resolution string
  let w: number | undefined;
  let h: number | undefined;
  if (typeof resolution === "string" && resolution.includes("x")) {
    const parts = resolution.toLowerCase().split("x");
    const pw = parseInt(parts[0], 10);
    const ph = parseInt(parts[1], 10);
    if (Number.isFinite(pw) && Number.isFinite(ph) && pw > 0 && ph > 0) {
      w = pw;
      h = ph;
    }
  }

  // Codec mapping
  let vCodec = "libx264";
  if (codec === "H.265") vCodec = "libx265";
  else if (codec === "VP9") vCodec = "libvpx-vp9";
  else if (codec === "AV1") vCodec = "libaom-av1";

  const targetFps = fps && String(fps).trim().length ? String(fps).trim() : "29.97";
  const sr = sampleRate === "48000" ? "48000" : "44100";
  const ac = audioChannels === "mono" ? "1" : "2";

  const ffArgs: string[] = ["-y"];

  // Inputs: for each video segment, -ss/-t before -i
  videoSegments.forEach(seg => {
    ffArgs.push(
      "-ss", seg.inSec.toFixed(3),
      "-t",  seg.len.toFixed(3),
      "-i",  seg.path,
    );
  });

  const videoCount = videoSegments.length;

  // Inputs for Audio 1 track (if any)
  audioSegments.forEach(seg => {
    ffArgs.push(
      "-ss", seg.inSec.toFixed(3),
      "-t",  seg.len.toFixed(3),
      "-i",  seg.path,
    );
  });

  const audioExtraCount = audioSegments.length;

  // Build per-clip effect filters (brightness/contrast/saturation/blur/fadeIn/fadeOut).
  // Each video clip may get a pre-processing chain before being fed into concat.
  const perClipVideoLabels: string[] = [];
  const perClipAudioLabels: string[] = [];
  const perClipFilters: string[] = [];

  videoClips.forEach((clip, i) => {
    const inVLabel = `[${i}:v]`;
    const inALabel = `[${i}:a]`;
    const fx = clip.effects ?? {};
    const clipLen = videoSegments[i].len;

    // Build video effect chain
    const vFilters: string[] = [];

    // eq= filter for brightness/contrast/saturation
    const hasBCS = (fx.brightness !== undefined && fx.brightness !== 0) ||
                   (fx.contrast !== undefined && fx.contrast !== 0) ||
                   (fx.saturation !== undefined && fx.saturation !== 0);
    if (hasBCS) {
      // ffmpeg eq filter: brightness -1..1, contrast 0..2, saturation 0..3
      const br = fx.brightness !== undefined ? (fx.brightness / 100).toFixed(3) : "0";
      const co = fx.contrast !== undefined ? (1 + fx.contrast / 100).toFixed(3) : "1";
      const sa = fx.saturation !== undefined ? (1 + fx.saturation / 100).toFixed(3) : "1";
      vFilters.push(`eq=brightness=${br}:contrast=${co}:saturation=${sa}`);
    }

    // blur via unsharp (negative amount = blur)
    if (fx.blur !== undefined && fx.blur > 0) {
      const blurAmt = Math.min(fx.blur, 10);
      vFilters.push(`unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=${(-blurAmt / 10).toFixed(2)}`);
    }

    // fadeIn / fadeOut video
    if (clip.fadeIn !== undefined && clip.fadeIn > 0) {
      vFilters.push(`fade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`);
    }
    if (clip.fadeOut !== undefined && clip.fadeOut > 0) {
      const fadeStart = Math.max(0, clipLen - clip.fadeOut);
      vFilters.push(`fade=t=out:st=${fadeStart.toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`);
    }

    if (vFilters.length > 0) {
      const outVLabel = `[vpre${i}]`;
      perClipFilters.push(`${inVLabel}${vFilters.join(",")}${outVLabel}`);
      perClipVideoLabels.push(outVLabel);
    } else {
      perClipVideoLabels.push(inVLabel);
    }

    // Audio fadeIn / fadeOut for this clip
    const aFilters: string[] = [];
    if (clip.fadeIn !== undefined && clip.fadeIn > 0) {
      aFilters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`);
    }
    if (clip.fadeOut !== undefined && clip.fadeOut > 0) {
      const fadeStart = Math.max(0, clipLen - clip.fadeOut);
      aFilters.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`);
    }

    if (aFilters.length > 0) {
      const outALabel = `[apre${i}]`;
      perClipFilters.push(`${inALabel}${aFilters.join(",")}${outALabel}`);
      perClipAudioLabels.push(outALabel);
    } else {
      perClipAudioLabels.push(inALabel);
    }
  });

  // Build concat filter.
  // FFmpeg concat filter requires n>=2; for a single clip we use null/anull to rename
  // the streams to [vcat][acat] so the rest of the filter graph stays identical.
  let filter: string = perClipFilters.length > 0 ? perClipFilters.join(";") + ";" : "";

  if (videoCount === 1) {
    filter += `${perClipVideoLabels[0]}null[vcat];${perClipAudioLabels[0]}anull[acat]`;
  } else {
    // [v0][a0][v1][a1]...concat=n=N:v=1:a=1[vcat][acat]
    const concatInputs = perClipVideoLabels.map((v, i) => `${v}${perClipAudioLabels[i]}`).join("");
    filter += `${concatInputs}concat=n=${videoCount}:v=1:a=1[vcat][acat]`;
  }

  // If there are extra audio track segments, delay and mix them on top of [acat]
  if (audioExtraCount > 0) {
    const delayChains = audioSegments
      .map((seg, idx) => {
        const inputIndex = videoCount + idx; // after video inputs
        const delayMs = Math.max(0, Math.round(seg.startSec * 1000));
        return `[${inputIndex}:a]adelay=${delayMs}|${delayMs}[aextra${idx}]`;
      })
      .join(";");

    const amixInputs = ["[acat]", ...audioSegments.map((_, idx) => `[aextra${idx}]`)].join("");
    filter += `;${delayChains};${amixInputs}amix=inputs=${audioExtraCount + 1}:normalize=0[aout]`;
  } else {
    filter += `;[acat]anull[aout]`;
  }

  // ── Text overlays (drawtext) ───────────────────────────────────────────────
  const tClips = Array.isArray(textClips) ? textClips : [];
  let videoLabel = "[vcat]";

  if (tClips.length > 0) {
    const textFilters: string[] = [];

    tClips.forEach((tc: any, idx: number) => {
      if (!tc || typeof tc.startSec !== "number" || typeof tc.durationSec !== "number") return;
      const start = Math.max(0, tc.startSec);
      const end = Math.max(start + 0.1, tc.startSec + tc.durationSec);
      const text = (tc.label ?? "").toString();
      if (!text.trim().length) return;

      // Escape characters that are special in ffmpeg drawtext option values.
      // Order matters: backslash first, then the rest.
      const esc = (s: string) =>
        s
          .replace(/\\/g, "\\\\")    // backslash → \\
          .replace(/'/g, "\\'")      // single-quote → \'
          .replace(/:/g, "\\:")      // colon → \:  (option separator)
          .replace(/,/g, "\\,")      // comma → \,  (filter-graph separator)
          .replace(/\[/g, "\\[")     // brackets used in lavfi expression syntax
          .replace(/\]/g, "\\]");

      const fontFamily = (tc.fontFamily || "Arial").toString();
      const fontSize = typeof tc.fontSize === "number" && tc.fontSize > 0 ? tc.fontSize : 32;
      const color = (tc.color || "#ffffff").toString();
      const tx = typeof tc.x === "number" ? tc.x : 50;
      const ty = typeof tc.y === "number" ? tc.y : 80;

      const xExpr = `(w*${tx}/100) - text_w/2`;
      const yExpr = `(h*${ty}/100) - text_h/2`;

      // Simple color mapping: #RRGGBB -> 0xRRGGBB
      const fontColor = color.startsWith("#") ? `0x${color.slice(1)}` : color;

      // Very simple style mapping for now; we can expand later
      let extraOpts = "";
      const styleId = tc.textStyle || "plain";
      if (styleId === "blackbox" || styleId === "pill" || styleId === "semitrans" || styleId === "redbanner" || styleId === "bluebanner") {
        const boxColor = styleId === "redbanner" ? "0xEF4444AA" : styleId === "bluebanner" ? "0x3B82F6AA" : "0x000000AA";
        extraOpts += `:box=1:boxcolor=${boxColor}:boxborderw=4`;
      } else if (styleId === "outline" || styleId === "yellowoutline") {
        extraOpts += ":borderw=2:bordercolor=0x000000";
      }

      const inLabel = videoLabel;
      // Use a per-filter index (not per-tClip index) so the chain is always correct
      // even when some tClips are skipped due to missing/empty text.
      const outLabel = `[vtext${textFilters.length}]`;

      const draw = `${inLabel}drawtext=` +
        `font='${esc(fontFamily)}':` +
        `text='${esc(text)}':` +
        `fontsize=${fontSize}:` +
        `fontcolor=${fontColor}${extraOpts}:` +
        `x=${xExpr}:y=${yExpr}:` +
        `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'` +
        outLabel;

      textFilters.push(draw);
      videoLabel = outLabel;
    });

    if (textFilters.length) {
      filter += `;${textFilters.join(";")}`;
      // Rename the final label to [vtext] so downstream scale/fps chain can reference it consistently
      filter += `;${videoLabel}null[vtext]`;
      videoLabel = "[vtext]";
    } else {
      filter += ";[vcat]null[vtext]";
      videoLabel = "[vtext]";
    }
  } else {
    filter += ";[vcat]null[vtext]";
    videoLabel = "[vtext]";
  }

  // Scale + fps chain after text overlays
  if (w && h) {
    filter += `;${videoLabel}scale=${w}:${h}[vscaled]`;
  } else {
    filter += `;${videoLabel}null[vscaled]`;
  }

  filter += `;[vscaled]fps=${targetFps}[vout]`;

  // Map quality preset → CRF value (lower = better quality / larger file)
  // libvpx-vp9 uses -crf differently (also needs -b:v 0), skip it for VP9.
  const crfMap: Record<string, number> = { draft: 32, good: 23, high: 18 };
  const crf = crfMap[quality ?? "good"] ?? 23;

  const videoQualityArgs: string[] = [];
  if (vCodec === "libx264" || vCodec === "libx265") {
    videoQualityArgs.push("-crf", String(crf));
  } else if (vCodec === "libvpx-vp9") {
    videoQualityArgs.push("-crf", String(crf), "-b:v", "0");
  } else if (vCodec === "libaom-av1") {
    videoQualityArgs.push("-crf", String(crf), "-b:v", "0", "-cpu-used", "4");
  }

  ffArgs.push(
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", vCodec,
    ...videoQualityArgs,
    "-c:a", "aac",
    "-ar", sr,
    "-ac", ac,
    outputPath,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ffArgs, { cwd: avmRoot });
    child.stdout.on("data", (d) => console.log("[EXPORT stdout]", d.toString()));
    child.stderr.on("data", (d) => console.log("[EXPORT stderr]", d.toString()));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Clean up partial output file so it doesn't look like a valid export
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

  return { outputPath };
}
