import fs from "fs";
import path from "path";

const WORKSPACE = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\src\\url-sets";
const URL_SETS_DIR = path.join(WORKSPACE, "video-tools", "url-sets");

export interface UrlSet {
  id: string;
  catalogName: string;
  topic: string;
  urls: string[];
  createdAt: string;
}

export function ensureUrlSetsDir() {
  if (!fs.existsSync(URL_SETS_DIR)) {
    fs.mkdirSync(URL_SETS_DIR, { recursive: true });
  }
}

export function saveUrlSet(catalogName: string, topic: string | null, urls: string[]): UrlSet {
  ensureUrlSetsDir();

  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = (catalogName || "untitled").trim().toLowerCase().replace(/\s+/g, "_") || "untitled";
  const safeTopic = (topic && topic.trim()) ? topic.trim().toLowerCase().replace(/\s+/g, "_") : baseName;
  const filename = `${safeTopic}_${id}.json`;
  const fullPath = path.join(URL_SETS_DIR, filename);

  const set: UrlSet = {
    id,
    catalogName,
    topic: safeTopic,
    urls,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(fullPath, JSON.stringify(set, null, 2), "utf8");
  return set;
}

export function listTopics(): string[] {
  ensureUrlSetsDir();
  const files = fs.readdirSync(URL_SETS_DIR).filter((f) => f.endsWith(".json"));
  const topics = new Set<string>();
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(URL_SETS_DIR, file), "utf8");
      const data = JSON.parse(raw) as UrlSet;
      if (data.topic) topics.add(data.topic);
    } catch {
      // ignore bad files
    }
  }
  return Array.from(topics).sort();
}

export function loadLatestUrlSet(topic: string): UrlSet | null {
  ensureUrlSetsDir();
  const safeTopic = (topic || "").trim().toLowerCase().replace(/\s+/g, "_");
  const files = fs
    .readdirSync(URL_SETS_DIR)
    .filter((f) => f.endsWith(".json") && f.startsWith(safeTopic + "_"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  try {
    const raw = fs.readFileSync(path.join(URL_SETS_DIR, latest), "utf8");
    return JSON.parse(raw) as UrlSet;
  } catch {
    return null;
  }
}
