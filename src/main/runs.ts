import fs from "fs";
import path from "path";

const OUT_ROOT = "C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Video\\EditVideo\\CompleteVideo";

export interface RunInfo {
  topic: string;
  date: string;
  editedFiles: string[];
}

export function listRuns(): RunInfo[] {
  if (!fs.existsSync(OUT_ROOT)) return [];

  const runs: RunInfo[] = [];

  const topics = fs
    .readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const topic of topics) {
    const topicDir = path.join(OUT_ROOT, topic);
    const dates = fs
      .readdirSync(topicDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const date of dates) {
      const editedDir = path.join(topicDir, date, "edited");
      if (!fs.existsSync(editedDir)) continue;
      const files = fs
        .readdirSync(editedDir, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => d.name)
        .filter((name) => name.toLowerCase().endsWith(".mp4"));
      if (files.length === 0) continue;
      runs.push({ topic, date, editedFiles: files });
    }
  }

  return runs;
}
