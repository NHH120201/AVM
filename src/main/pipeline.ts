import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { loadLatestUrlSet, saveUrlSet } from "./urlSets";

const WORKSPACE = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM";
const OUT_ROOT = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Video\\DownloadedVideo";
const SCRAPER_DIR = path.join(WORKSPACE, "src", "download");
const URLS_JSON_PATH = path.join(SCRAPER_DIR, "urls.json");

export type StepId = "download" | "editor";

export interface PipelineOptions {
  topic: string;
  targetDuration: number;
  mute: boolean;
  maxClipSeconds: number;
  outputFolder: string;        // ← add
  urls?: string[];             // ← add
  onLog: (line: string) => void;
  onStep: (step: StepId, status: "pending" | "running" | "done" | "error") => void;
}
export async function runPipeline(opts: PipelineOptions): Promise<{
  finalPath: string | null;
  reportPath: string | null;
}> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const topicSafe = opts.topic.trim().toLowerCase().replace(/\s+/g, "_");

  // 0) Sync latest URL set into urls.json for this topic
  if (opts.urls && opts.urls.length > 0) {
    const { saveUrlSet } = await import("./urlSets");
    saveUrlSet(topicSafe, topicSafe, opts.urls);
    opts.onLog(`[INFO] Saved ${opts.urls.length} URL(s) for topic '${topicSafe}'`);
  }

  // Then sync into urls.json for the scraper
  await ensureUrlsJsonForTopic(topicSafe, opts.onLog);

  // 1) Scraper ONLY (download assets)
  opts.onStep("download", "running");
  const urlArgs = (opts.urls && opts.urls.length > 0)
    ? ["--urls", opts.urls.join(",")]
    : [];
  try {
    await runProcess(
      "node",
      [
        "src/download/download.js",
        "--topic", opts.topic,
        "--minDuration", "5",
        "--maxDuration", "600",
        "--maxVideos", "10",
        "--outDir", opts.outputFolder,
        ...urlArgs,
      ],
      WORKSPACE,
      opts.onLog
    );
    opts.onStep("download", "done");
  } catch (err: any) {
    opts.onLog(`[ERROR] Scraper failed: ${err.message}`);
    opts.onStep("download", "error");
    throw err; // stop pipeline
  }

  // Mark editor as not used for this operation
  opts.onStep("editor", "pending");

  // For Download Assets, we don't build a final video here.
  return { finalPath: null, reportPath: null };
}

async function ensureUrlsJsonForTopic(topicSafe: string, onLog: (line: string) => void) {
  const set = loadLatestUrlSet(topicSafe);
  if (!set) {
    onLog(`[WARN] No URL set found for topic '${topicSafe}', urls.json will not be updated.`);
    return;
  }

  let urlsConfig: Record<string, string[]> = {};
  if (fs.existsSync(URLS_JSON_PATH)) {
    try {
      urlsConfig = JSON.parse(fs.readFileSync(URLS_JSON_PATH, "utf8"));
    } catch {
      urlsConfig = {};
    }
  }

  urlsConfig[topicSafe] = set.urls;

  if (!fs.existsSync(SCRAPER_DIR)) {
    fs.mkdirSync(SCRAPER_DIR, { recursive: true });
  }

  fs.writeFileSync(URLS_JSON_PATH, JSON.stringify(urlsConfig, null, 2), "utf8");
  onLog(`[INFO] Updated urls.json for topic '${topicSafe}' with ${set.urls.length} URLs from set '${set.catalogName}'.`);
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  onLog: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false });

    child.stdout.on("data", (chunk) => {
      chunk.toString().split(/\r?\n/).forEach((line: string) => {
        if (line.trim()) onLog(line);
      });
    });

    child.stderr.on("data", (chunk) => {
      chunk.toString().split(/\r?\n/).forEach((line: string) => {
        if (line.trim()) onLog(line);
      });
    });

        child.on("exit", (code) => {
      if (code === 0) resolve();
      else {
      onLog(`[ERROR] Process failed with code ${code}: ${cmd} ${args.join(" ")}`);
      reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    }
    );
  });
}
