#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    manifest: null,
    targetDuration: 90,
    maxClips: 5,
    outDir: "C:\\Users\\Admin\\Videos\\animal_pipeline",
    trimStart: 0.2,
    trimEnd: 0.2,
    mute: false, // new flag
    maxClip: 0 // 0 = no cap
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!val) continue;
    if (key === "--manifest") opts.manifest = val;
    if (key === "--targetDuration") opts.targetDuration = Number(val);
    if (key === "--maxClips") opts.maxClips = Number(val);
    if (key === "--outDir") opts.outDir = val;
    if (key === "--trimStart") opts.trimStart = Number(val);
    if (key === "--trimEnd") opts.trimEnd = Number(val);
    if (key === "--mute") opts.mute = val === "true" || val === "1";
    if (key === "--maxClip") opts.maxClip = Number(val);
  }
  if (!opts.manifest) {
    console.error("Missing --manifest path");
    process.exit(1);
  }
  return opts;
}

function run(cmd, args, cwd) {
  console.log("[CMD]", cmd, args.join(" "));
  return execFileSync(cmd, args, { cwd, encoding: "utf8" });
}

function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

function ensureDirs(outBaseDir, topic, dateStr) {
  // outBaseDir is something like: C:\Users\Admin\Videos\animal_pipeline
  // We want: outBaseDir\<topic>\<date>\edited + temp
  const safeTopic = (topic || "unknown_topic").trim().toLowerCase().replace(/\s+/g, "_");

  const topicDir = path.join(outBaseDir, safeTopic, dateStr);
  const finalDir = path.join(topicDir, "edited");
  const tempDir = path.join(finalDir, "temp");

  fs.mkdirSync(finalDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  return { finalDir, tempDir };
}

function probeDurationSec(filePath) {
  const out = run(
    "C:\\tools\\ffmpeg\\bin\\ffprobe.exe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
    path.dirname(filePath)
  );
  return Number(out.trim());
}

function transcodeClip(inputPath, outputPath, trimStart, trimEnd, maxClip) {
  const duration = probeDurationSec(inputPath);
  let ss = 0;
  let t = duration;

  if (duration > trimStart + trimEnd + 0.5) {
    ss = trimStart;
    t = duration - trimStart - trimEnd;
  }

  if (maxClip > 0 && t > maxClip) {
    t = maxClip;
  }

  const args = [
    "-ss",
    ss.toFixed(2),
    "-i",
    inputPath,
    "-t",
    t.toFixed(2),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-y",
    outputPath,
  ];
  run("C:\\tools\\ffmpeg\\bin\\ffmpeg.exe", args, path.dirname(outputPath));
  return t;
}

function main() {
  const opts = parseArgs();
  const manifest = loadManifest(opts.manifest);

  const topic = manifest.topic || "unknown_topic";
  const dateStr = manifest.date || new Date().toISOString().slice(0, 10);

  // opts.outDir now treated as the base pipeline folder: C:\Users\Admin\Videos\animal_pipeline
  const { finalDir, tempDir } = ensureDirs(opts.outDir, topic, dateStr);

  const videos = manifest.videos || [];
  if (!videos.length) {
    console.error("Manifest has no videos");
    process.exit(1);
  }

  // Select clips up to targetDuration (allowing small overshoot)
  const selected = [];
  let total = 0;
      for (const v of videos) {
      if (!v.localPath) continue;
      if (selected.length >= opts.maxClips) break;
      const dur = v.durationSec || probeDurationSec(v.localPath);
      selected.push({ ...v, durationSec: dur });
      total += dur;
    }

  if (!selected.length) {
    console.error("No suitable clips selected");
    process.exit(1);
  }

  // Transcode selected clips and build concat list
  const concatListPath = path.join(tempDir, "concat_list.txt");
  const concatLines = [];
  let clipIndex = 1;
  let finalDuration = 0;

  for (const clip of selected) {
    const indexStr = String(clipIndex).padStart(3, "0");
    const outClipPath = path.join(tempDir, `clip-${indexStr}.mp4`);

    const usedDuration = transcodeClip(
      clip.localPath,
      outClipPath,
      opts.trimStart,
      opts.trimEnd,
      opts.maxClip
    );
    finalDuration += usedDuration;
    concatLines.push(`file '${outClipPath.replace(/'/g, "'\\''")}'`);
    clipIndex++;
  }

  fs.writeFileSync(concatListPath, concatLines.join("\n"), "utf8");

  // Use topic from manifest for filename when present
  let baseName = "final";
  if (manifest.topic && typeof manifest.topic === "string") {
    baseName = manifest.topic.trim().toLowerCase().replace(/\s+/g, "_");
  }
  const finalPath = path.join(finalDir, `${baseName}.mp4`);

  // Build ffmpeg args with optional mute
  const ffmpegArgs = ["-f", "concat", "-safe", "0", "-i", concatListPath];
  if (opts.mute) {
    ffmpegArgs.push("-c:v", "copy", "-an");
  } else {
    ffmpegArgs.push("-c", "copy");
  }
  ffmpegArgs.push("-y", finalPath);

  run("C:\\tools\\ffmpeg\\bin\\ffmpeg.exe", ffmpegArgs, finalDir);

  const report = {
    status: "ok",
    topic: manifest.topic || null,
    finalPath,
    totalDurationSec: finalDuration,
    numClips: selected.length,
  };
  const reportPath = path.join(finalDir, `${baseName}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log("[INFO] Final video written to", finalPath);
  console.log("[INFO] Report written to", reportPath);
}

main();
