#!/usr/bin/env node
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FFPROBE = "ffprobe.exe";
const MAX_PARALLEL = 3;

/* ------------------------- UTIL ------------------------- */

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);

    proc.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
  });
}

/* ------------------------- ARGS ------------------------- */

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    topic: "animal_kingdom",
    minDuration: 5,
    maxDuration: 36000,
    maxVideos: 10,
    outDir: "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Video\\DownloadedVideo",
    urls: []
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const val = args[i + 1];

    if (!val) continue;

    switch (key) {
      case "--topic": opts.topic = val; break;
      case "--minDuration": opts.minDuration = Number(val); break;
      case "--maxDuration": opts.maxDuration = Number(val); break;
      case "--maxVideos": opts.maxVideos = Number(val); break;
      case "--outDir": opts.outDir = val; break;
      case "--urls":
        opts.urls = val.split(",").map(v => v.trim()).filter(Boolean);
        break;
    }
  }

  return opts;
}

/* ------------------------- DIR ------------------------- */

function ensureDirs(baseOutDir, topic) {

  const safeTopic = topic
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const dateStr = new Date().toISOString().slice(0, 10);

  const topicDir = path.join(baseOutDir, safeTopic, dateStr);
  const rawDir = path.join(topicDir, "raw");

  fs.mkdirSync(rawDir, { recursive: true });

  return {
    rawDir,
    manifestDir: topicDir,
    dateStr
  };
}

/* ------------------------- URL SOURCE ------------------------- */

function getUrls(topic, maxVideos, directUrls) {

  if (directUrls.length) {
    console.log(`[INFO] Using provided URLs`);
    return directUrls.slice(0, maxVideos);
  }

  const urlsPath = path.join(__dirname, "urls.json");

  if (!fs.existsSync(urlsPath))
    throw new Error("urls.json not found");

  const data = JSON.parse(fs.readFileSync(urlsPath, "utf8"));

  const safe = topic.toLowerCase().replace(/\s+/g, "_");
  const list = data[safe] || data[topic] || [];

  if (!list.length)
    throw new Error(`No URLs found for topic ${topic}`);

  return list.slice(0, maxVideos);
}

/* ------------------------- PROBE ------------------------- */

async function probeDuration(file) {

  const out = await run(
    FFPROBE,
    ["-v","error","-show_entries","format=duration","-of","csv=p=0",file],
    path.dirname(file)
  );

  return Number(out);
}

async function probeResolution(file) {

  const out = await run(
    FFPROBE,
    [
      "-v","error",
      "-select_streams","v:0",
      "-show_entries","stream=width,height",
      "-of","csv=p=0",
      file
    ],
    path.dirname(file)
  );

  const [w,h] = out.split(",");
  return `${w}x${h}`;
}

/* ------------------------- DOWNLOAD ------------------------- */

async function downloadVideo(url, rawDir, index) {

  const idx = String(index).padStart(3,"0");
  const outTemplate = `video-${idx}.%(ext)s`;

  console.log("[DOWNLOAD]", url);

  await run(
    "yt-dlp",
    [
    "--no-playlist",
    "--retries", "5",
    "--fragment-retries", "5",
    "--concurrent-fragments", "4",
    "--limit-rate", "10M",
    "-f", "best",
    "--progress",
    "--merge-output-format", "mp4",
    "--print","after_move:filepath",
    "-o", outTemplate,
    url
    ],
    rawDir
  );

  const file = fs.readdirSync(rawDir)
    .find(f => f.startsWith(`video-${idx}.`));

  if (!file)
    throw new Error("Download failed");

  return path.join(rawDir,file);
}

/* ------------------------- INDEX ------------------------- */

function getNextIndex(rawDir) {

  const files = fs.readdirSync(rawDir);

  let max = 0;

  for (const f of files) {
    const m = f.match(/^video-(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }

  return max + 1;
}

/* ------------------------- MAIN ------------------------- */

async function main() {

  const opts = parseArgs();

  const { rawDir, manifestDir, dateStr } =
    ensureDirs(opts.outDir, opts.topic);

  const urls =
    getUrls(opts.topic, opts.maxVideos, opts.urls);

  const manifestPath =
    path.join(manifestDir,"manifest.json");

  let manifest = {
    topic: opts.topic,
    date: dateStr,
    downloadFolder: rawDir,
    videos: []
  };

  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath));
  }

  let index = getNextIndex(rawDir);

  const queue = [...urls];

  const workers = Array(MAX_PARALLEL).fill(0).map(async () => {

    while (queue.length) {

      const url = queue.shift();

      try {

        const file =
          await downloadVideo(url,rawDir,index++);

        const duration =
          await probeDuration(file);

        if (
          duration < opts.minDuration ||
          duration > opts.maxDuration
        ) {
          fs.unlinkSync(file);
          continue;
        }

        const resolution =
          await probeResolution(file);

        manifest.videos.push({
          title:null,
          source:"youtube",
          url,
          localPath:file,
          durationSec:duration,
          resolution
        });

        console.log("[OK]",file);

      } catch(err) {

        console.log("[ERROR]",err.message);

      }
    }
  });

  await Promise.all(workers);

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest,null,2)
  );

  console.log("Manifest saved:",manifestPath);
}

main();