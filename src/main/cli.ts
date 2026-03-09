import { runPipeline } from "./pipeline";

interface Args {
  topic: string;
  targetDuration: number;
  mute: boolean;
  maxClipSeconds: number;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }

  const topic = (args.topic as string) || "";
  const targetDuration = Number(args.seconds ?? args.targetDuration ?? 120);
  const mute = args.mute === "false" ? false : true;
  const maxClipSeconds = args.maxClip ? Number(args.maxClip) : 10;

  if (!topic) {
    throw new Error("Missing required --topic argument");
  }
  if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
    throw new Error("Invalid --seconds / --targetDuration");
  }

  return { topic, targetDuration, mute, maxClipSeconds };
}

async function main() {
  try {
    const { topic, targetDuration, mute, maxClipSeconds } = parseArgs(
      process.argv.slice(2)
    );

    const onLog = (line: string) => {
      console.log(line);
    };
    const onStep = (
      step: "scraper" | "editor",
      status: "pending" | "running" | "done" | "error"
    ) => {
      console.log(`[STEP] ${step} -> ${status}`);
    };

    const result = await runPipeline({
      topic,
      targetDuration,
      mute,
      maxClipSeconds,
      outputFolder: "",
       urls: [],
      onLog,
      onStep,
    });

    const summary = {
      ok: true,
      topic,
      targetDuration,
      mute,
      maxClipSeconds,
      finalPath: result.finalPath,
      reportPath: result.reportPath,
    };
    console.log("PIPELINE_RESULT_JSON:" + JSON.stringify(summary));
    process.exit(0);
  } catch (err: any) {
    console.error("ERROR:", err?.message ?? String(err));
    process.exit(1);
  }
}

main();
