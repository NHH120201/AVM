import fs from "fs";
import path from "path";

const OUT_ROOT = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Video\\EditVideo\\CompleteVideo";

interface Manifest {
  topic: string;
  date: string;
  downloadFolder: string;
  videos: ManifestVideo[];
}

export interface ManifestVideo {
  url: string | null;
  localPath: string;
  durationSec: number;
  resolution?: string;
}

export function loadLatestManifest(topic: string): Manifest | null {
  const safeTopic = (topic || "unknown_topic").trim().toLowerCase().replace(/\s+/g, "_");
  const topicDir = path.join(OUT_ROOT, safeTopic);
  if (!fs.existsSync(topicDir)) return null;

  // Find the latest date folder under topicDir
  const dates = fs
    .readdirSync(topicDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (dates.length === 0) return null;

  const latestDate = dates[dates.length - 1];
  const manifestPath = path.join(topicDir, latestDate, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as Manifest;
  return manifest;
}
