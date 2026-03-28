import React, { useEffect, useRef, useState } from "react";
import { ManifestVideo } from "./types";
import { VideoEditor, TimelineClip, TextClip } from "./VideoEditor";

type StepStatus = "pending" | "running" | "done" | "error";

const initialSteps: Record<string, StepStatus> = {
  download: "pending",
  editor: "pending",
};

interface SelectedVideoForFinal {
  path: string;
  label: string;
}

export const App: React.FC = () => {
  const [topicTag, setTopicTag] = useState<string>("");
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [duration, setDuration] = useState(60);
  const [proMode, setProMode] = useState(false);
  const [playlistMaxClipSeconds, setPlaylistMaxClipSeconds] = useState(10);
  const [playlistMaxDurationSeconds, setPlaylistMaxDurationSeconds] = useState(60);
  const [mute, setMute] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [steps, setSteps] = useState<Record<string, StepStatus>>(initialSteps);
  const [finalPath, setFinalPath] = useState("");
  const [reportPath, setReportPath] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [downloadFolder, setDownloadFolder] = useState<string | null>(null);
  const [useExistingFolder, setUseExistingFolder] = useState(false);
  const [existingTopics, setExistingTopics] = useState<string[]>([]);
  const [selectedExistingTopic, setSelectedExistingTopic] = useState<string | null>(null);
  const [videos, setVideos] = useState<ManifestVideo[]>([]);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(null);
  const [folderOverride, setFolderOverride] = useState<string | null>(null);
  const [useFolderOnly, setUseFolderOnly] = useState<boolean>(false);

  const [loopSelected, setLoopSelected] = useState(true);
  const [selectedForFinal, setSelectedForFinal] = useState<SelectedVideoForFinal[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  // TTS
  type TtsStyle = "calm" | "natural" | "hype";
  const [ttsText, setTtsText] = useState("");
  const [ttsOutputPath, setTtsOutputPath] = useState<string | null>(null);
  const [ttsRunning, setTtsRunning] = useState(false);
  const [ttsPromptPath, setTtsPromptPath] = useState<string | null>(null);
  const [ttsStyle, setTtsStyle] = useState<TtsStyle>("natural");
  const [ttsManualStyle, setTtsManualStyle] = useState(false);
  const [ttsExaggeration, setTtsExaggeration] = useState(1.0);
  const [ttsCfgWeight, setTtsCfgWeight] = useState(2.0);

  // Narration selection for final video (Simple Mode only)
  type NarrationMode = "none" | "generated" | "manual";
  const [narrationMode, setNarrationMode] = useState<NarrationMode>("none");
  const [generatedVoices, setGeneratedVoices] = useState<{ label: string; path: string }[]>([]);
  const [selectedGeneratedVoice, setSelectedGeneratedVoice] = useState<string | null>(null);
  const [manualNarrationPath, setManualNarrationPath] = useState<string | null>(null);
  const [voskJsonPath, setVoskJsonPath] = useState<string | null>(null);
  const [subtitleFont, setSubtitleFont] = useState<string>("Luckiest Guy");
  const [subtitleSize, setSubtitleSize] = useState<number>(40);
  const [subtitleColor, setSubtitleColor] = useState<string>("white");
  const [subtitlePosition, setSubtitlePosition] = useState<"bottom" | "middle" | "top">("bottom");
  const [trimToNarration, setTrimToNarration] = useState<boolean>(true);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    window.api.onLog((line) => {
      setLog((prev) => [...prev, line]);
    });

    window.api.onStep(({ step, status }) => {
      setSteps((prev) => ({ ...prev, [step]: status as StepStatus }));
    });

    window.api.listTopics().then((topics) => {
      setAvailableTopics(topics);
      if (!topicTag && topics.length > 0) {
        setTopicTag(topics[0]);
      }
    });

    // Initial load of generated voices list (for Simple Mode narration selector)
    window.api.listGeneratedVoices?.()
      .then((voices) => {
        if (Array.isArray(voices)) {
          setGeneratedVoices(voices);
          if (!selectedGeneratedVoice && voices.length > 0) {
            setSelectedGeneratedVoice(voices[voices.length - 1].path);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = logContainerRef.current;
    if (!el) return;
    if (autoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log]);
  const savedEditorTimeline = useRef<TimelineClip[] | null>(null);
  const savedEditorTextClips = useRef<TextClip[] | null>(null);
  const [editorTimeline, setEditorTimeline] = useState<TimelineClip[] | null>(null);
  const [editorTextClips, setEditorTextClips] = useState<TextClip[] | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDialogTitle, setExportDialogTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportQuality, setExportQuality] = useState<"draft" | "good" | "high">("good");
  const [exportResolution, setExportResolution] = useState("1080x1920");
  const [exportAdvancedOpen, setExportAdvancedOpen] = useState(false);
  const [exportCodec, setExportCodec] = useState("H.264");
  const [exportFps, setExportFps] = useState("29.97");
  const [exportBitrateMode, setExportBitrateMode] = useState("VBR");
  const [exportQualitySlider, setExportQualitySlider] = useState(50); // 0-100
  const [exportSampleRate, setExportSampleRate] = useState("44100");
  const [exportAudioChannels, setExportAudioChannels] = useState<"stereo" | "mono">("stereo");

  const handleLogScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const threshold = 20;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    autoScrollRef.current = isAtBottom;
  };

  const effectiveTopic = topicTag;

  const handleRun = async () => {
    const urls = urlsText
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (!urls.length) {
      setLog((prev) => [...prev, "ERROR: No URLs provided."]);
      return;
    }
    if (!downloadFolder) {
      setLog((prev) => [...prev, "ERROR: No target folder selected."]);
      return;
    }

    let topicForRun: string;
    if (useExistingFolder) {
      if (!selectedExistingTopic) {
        setLog((prev) => [...prev, "ERROR: Use existing folder is enabled but no folder is selected."]);
        return;
      }
      topicForRun = selectedExistingTopic;
    } else {
      topicForRun = (topicTag && topicTag.trim()) || "untitled";
    }

    setRunning(true);
    setLog([]);
    setSteps({ download: "pending", editor: "pending" });
    setFinalPath("");
    setReportPath("");
    setVideos([]);
    setSelectedVideoIndex(null);

    try {
      const result = await window.api.runPipeline({
        topic: topicForRun,
        targetDuration: duration,
        mute,
        maxClipSeconds: 0,
        outputFolder: downloadFolder,
        urls,
      });
      setTopicTag(topicForRun);
      if (useExistingFolder) {
        // keep selected existing
      }
      // Download Clips is download-only now; finalPath/reportPath will be null

      const manifest = await window.api.loadManifest({ topic: topicForRun });
      if (manifest && manifest.videos && manifest.videos.length > 0) {
        setUseFolderOnly(false);
        setVideos(manifest.videos);
        setSelectedVideoIndex(0);
      }
    } catch (err: any) {
      setLog((prev) => [...prev, `ERROR: ${err.message || String(err)}`]);
      setSteps((prev) => ({ ...prev, editor: "error" }));
    } finally {
      setRunning(false);
    }
  };

  const handleOpenFolder = () => {
    if (!finalPath) return;
    const folder = finalPath.replace(/[^\\/]+$/, "");
    window.open(`file://${folder.replace(/\\/g, "/")}`);
  };

  const handleAddSelectedClipToPlaylist = () => {
    if (!videos.length) return;
    if (selectedVideoIndex == null || selectedVideoIndex < 0 || selectedVideoIndex >= videos.length) return;
    const v = videos[selectedVideoIndex];
    const path = v.localPath;
    const label = v.localPath.split(/\\|\//).slice(-1)[0];
    setSelectedForFinal((prev) => {
      if (prev.some((item) => item.path === path)) return prev;
      return [...prev, { path, label }];
    });
  };

  const handleTtsGenerate = async () => {
    if (!ttsText.trim()) return;
    setTtsRunning(true);

    // Default style from presets
    const styleParams: Record<TtsStyle, { exaggeration: number; cfg: number }> = {
      calm: { exaggeration: 0.85, cfg: 1.5 },
      natural: { exaggeration: 1.0, cfg: 2.0 },
      hype: { exaggeration: 1.3, cfg: 2.5 },
    };

    let exaggeration: number;
    let cfg: number;

    if (ttsManualStyle) {
      exaggeration = ttsExaggeration;
      cfg = ttsCfgWeight;
    } else {
      const preset = styleParams[ttsStyle];
      exaggeration = preset.exaggeration;
      cfg = preset.cfg;
    }

    try {
      const result = await window.api.ttsGenerate?.({
        text: ttsText.trim(),
        outputPath: "",
        promptPath: ttsPromptPath,
        exaggeration,
        cfgWeight: cfg,
      });
      if (!result) return;
      setTtsOutputPath(result.outputPath);
      setLog((prev) => [...prev, `[TTS] Generated: ${result.outputPath}`]);

      // Auto-run Vosk STT on the generated WAV to create .vosk.json
      try {
        await window.api.ttsTranscribe?.(result.outputPath);
      const baseName = result.outputPath.replace(/^.*[\\/]/, "").replace(/\.wav$/i, "");
      const jsonPath = `C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Audio\\Subtitles\\${baseName}.vosk.json`;
      setVoskJsonPath(jsonPath);
      setLog((prev) => [...prev, `[STT] Vosk transcript created: ${jsonPath}`]);
        } catch (err: any) {
          setLog((prev) => [...prev, `[STT ERROR] ${err.message || String(err)}`]);
        }

      // Refresh generated voices list so new file appears in the Simple Mode narration dropdown
      try {
        const voices = await window.api.listGeneratedVoices?.();
        if (Array.isArray(voices)) {
          setGeneratedVoices(voices);
          if (voices.length > 0) {
            setSelectedGeneratedVoice(voices[voices.length - 1].path);
          }
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      setLog((prev) => [...prev, `[TTS ERROR] ${err.message || String(err)}`]);
    } finally {
      setTtsRunning(false);
    }
  };

  const handleBuildFinalFromSelected = async () => {
    if (!selectedForFinal.length) return;

    console.log("[Build] selectedForFinal:", JSON.stringify(selectedForFinal, null, 2));

    const topic = topicTag || "playlist";
    const maxClip = playlistMaxClipSeconds > 0 ? playlistMaxClipSeconds : 10;
    const maxDuration = playlistMaxDurationSeconds > 0 ? playlistMaxDurationSeconds : 60;

    let narrationAudioPath: string | null = null;
    if (narrationMode === "generated" && selectedGeneratedVoice) {
      narrationAudioPath = selectedGeneratedVoice;
    } else if (narrationMode === "manual" && manualNarrationPath) {
      narrationAudioPath = manualNarrationPath;
    }

    const result = await window.api.buildFinalFromSelected({
      topic,
      items: selectedForFinal,
      maxClipSeconds: maxClip,
      maxDurationSeconds: maxDuration,
      narrationAudioPath,
      trimToNarration,
    });

    setFinalPath(result.outputPath);
    setLog((prev) => [...prev, `Final video created: ${result.outputPath}`]);
  };

  const handleRemoveSelectedForFinal = (path: string) => {
    setSelectedForFinal((prev) => prev.filter((v) => v.path !== path));
  };

  const selectedVideo =
    selectedVideoIndex != null &&
    selectedVideoIndex >= 0 &&
    selectedVideoIndex < videos.length
      ? videos[selectedVideoIndex]
      : null;

  const selectedVideoFileUrl = selectedVideo
    ? `file:///${selectedVideo.localPath.replace(/\\/g, "/")}`
    : null;

  const finalFileUrl = finalPath ? `file:///${finalPath.replace(/\\/g, "/")}` : null;

  const handleBurnSubtitlesWithVosk = async () => {
    if (!finalPath) {
      setLog((prev) => [...prev, "[SUB] No final video available to burn subtitles on."]);
      return;
    }

    // Prefer an explicitly chosen JSON; fall back to inferring from generated voice.
    let jsonPath: string | null = voskJsonPath;
    if (!jsonPath && selectedGeneratedVoice) {
      const baseName = selectedGeneratedVoice.replace(/^.*[\\/]/, "").replace(/\.wav$/i, "");
      jsonPath = `C:\\Users\\Admin\\.openclaw\\workspace\\AVM\\Audio\\Subtitles\\${baseName}.vosk.json`;
    }

    if (!jsonPath) {
      setLog((prev) => [...prev, "[SUB] No Vosk JSON selected or inferred; cannot burn subtitles."]);
      return;
    }

    try {
      const result = await window.api.injectCaption({
        inputPath: finalPath,
        voskJsonPath: jsonPath,
        font: subtitleFont,
        size: subtitleSize,
        color: subtitleColor,
        position: subtitlePosition,
      });
      setFinalPath(result.outputPath);
      setLog((prev) => [...prev, `[SUB] Subtitled video created: ${result.outputPath}`]);
    } catch (err: any) {
      setLog((prev) => [...prev, `[SUB ERROR] ${err.message || String(err)}`]);
    }
  };

  const renderProUI = () => (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: -0.025,
            margin: 0,
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ display: "none" }} />
          ViewMaker
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>v2.4.0 (Stable)</span>
          <button
            style={{
              background: !proMode ? "#2563eb" : "#f1f5f9",
              color: !proMode ? "white" : "#475569",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              border: "none",
              cursor: !proMode ? "default" : "pointer",
            }}
            onClick={() => setProMode(false)}
            disabled={!proMode}
          >
            Simple Mode
          </button>
          <button
            style={{
              background: proMode ? "#22c55e" : "#f1f5f9",
              color: proMode ? "#0a0a0f" : "#475569",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              border: "none",
              cursor: proMode ? "default" : "pointer",
            }}
            onClick={() => setProMode(true)}
            disabled={proMode}
          >
            Go Pro
          </button>
          <button
            className="secondary"
            style={{
              background: "#f1f5f9",
              color: "#475569",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              border: "none",
              cursor: "pointer",
            }}
          >
            Preferences
          </button>
          <button
            onClick={() => setEditorOpen(true)}
            style={{
              background: "linear-gradient(135deg, #1d4ed8, #4f46e5)",
              border: "none",
              color: "white",
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            âœ‚ Open Timeline Editor
          </button>
        </div>
      </header>

      <div
        className="grid-container"
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr 340px",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        {/* LEFT COLUMN: INGESTION */}
        <div className="left-col" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section>
            <h2>Sources &amp; Import</h2>
            <div style={{ marginBottom: 16 }}>
              <label>Paste YouTube links (one per line)</label>
              <textarea
                rows={4}
                placeholder="Paste links here..."
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Where to save downloaded clips</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="secondary"
                  style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
                  onClick={async () => {
                    const result = await window.api.pickTargetFolder();
                    if (!result) return;
                    setDownloadFolder(result.folder);
                  }}
                >
                  Browse
                </button>
                <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {downloadFolder || "C:/Videos/Clips"}
                </code>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Project name (folder name)</label>
              <input
                type="text"
                placeholder="e.g. cats, dogs, funny_cats"
                value={topicTag}
                onChange={(e) => setTopicTag(e.target.value)}
                disabled={useExistingFolder}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={useExistingFolder}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setUseExistingFolder(checked);
                    if (checked && downloadFolder) {
                      const topics = await window.api.listTopicsInFolder?.(downloadFolder) ?? [];
                      setExistingTopics(topics);
                      setSelectedExistingTopic(topics[0] ?? null);
                    }
                  }}
                  style={{ width: "auto" }}
                />
                Use existing folder
              </label>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Old folder:</span>
                <select
                  disabled={!useExistingFolder || existingTopics.length === 0}
                  value={selectedExistingTopic ?? ""}
                  onChange={(e) =>
                    setSelectedExistingTopic(e.target.value || null)
                  }
                  style={{
                    width: "100%",
                    marginTop: 4,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    padding: "6px 10px",
                    fontSize: 12,
                  }}
                >
                  <option value="">
                    {existingTopics.length === 0
                      ? "No folders found under target folder"
                      : "Select a folder..."}
                  </option>
                  {existingTopics.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              style={{ width: "100%" }}
              onClick={handleRun}
              disabled={!urlsText.trim() || !downloadFolder || running}
            >
              {running ? "Downloading..." : "Download Clips"}
            </button>
          </section>

          <section>
            <h2>System Logs</h2>
            <div
              className="logBox"
              ref={logContainerRef}
              onScroll={handleLogScroll}
            >
              {log.length === 0 ? (
                <div className="log-entry">Waiting for actions...</div>
              ) : (
                log.map((line, idx) => (
                  <div key={idx} className="log-entry">
                    {line}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* MIDDLE COLUMN: EDITOR */}
        <div className="mid-col">
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h2 style={{ margin: 0 }}>Composition Workspace</h2>
              <div className="flex-row">
                <button
                  className="secondary"
                  style={{ fontSize: 11 }}
                  onClick={() => {
                    setSelectedForFinal([]);
                    setVideos([]);
                    setSelectedVideoIndex(null);
                  }}
                >
                  Start Over
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Use videos from your computer</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={async () => {
                  // Use folder picker (pickTargetFolder) + server-side listing,
                  // so this truly behaves as a "Use videos from your computer" chooser.
                  const folderResult = await window.api.pickTargetFolder?.();
                  if (!folderResult || !folderResult.folder) return;
                  const baseFolder = folderResult.folder as string;

                  // Ask backend to list media files under this folder (no extra dialog)
                  const listResult = await window.api.listVideosInFolder?.(baseFolder);
                  const files = listResult?.files ?? [];

                  setFolderOverride(baseFolder);
                  const mapped: ManifestVideo[] = files.map((fullPath: string) => ({
                    url: null,
                    localPath: fullPath,
                    durationSec: 0,
                    resolution: undefined,
                  }));
                  setUseFolderOnly(true);
                  setVideos(mapped);
                  setSelectedVideoIndex(mapped.length ? 0 : null);
                  setSelectedForFinal([]);
                }}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Choose Folder
              </button>
              <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                {folderOverride || "C:/Users/Admin/.openclaw/workspace/AVM/Video/DownloadedVideo"}
              </code>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
                        {/* Player */}
              <div>
                <div className="video-preview-wrapper">
                  {selectedVideo && selectedVideoFileUrl ? (
                    <video src={selectedVideoFileUrl} controls loop={loopSelected} />
                  ) : (
                    <div
                      style={{
                        color: "white",
                        display: "flex",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                      }}
                    >
                      No video selected
                    </div>
                  )}
                </div>
                <div className="flex-row mb-4">
                  <select
                    value={selectedVideoIndex ?? ""}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedVideoIndex(Number.isNaN(idx) ? null : idx);
                    }}
                    disabled={videos.length === 0}
                  >
                    {videos.length === 0 && <option>Choose a clip you downloaded...</option>}
                    {videos.map((v, idx) => (
                      <option key={v.localPath} value={idx}>
                        {v.localPath.split("\\").pop()}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddSelectedClipToPlaylist}
                    disabled={videos.length === 0 || selectedVideoIndex == null}
                  >
                    Add to video
                  </button>
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 400,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={loopSelected}
                    onChange={(e) => setLoopSelected(e.target.checked)}
                  />
                  Repeat preview
                </label>
              </div>

              {/* Playlist */}
              <div>
                <label>Video order</label>
                <div className="playlist-container">
                  {selectedForFinal.length === 0 ? (
                    <div className="playlist-item">
                      <span style={{ color: "#64748b" }}>No clips added yet.</span>
                    </div>
                  ) : (
                    selectedForFinal.map((v, idx) => (
                      <div key={v.path} className="playlist-item">
                        <span>
                          {idx + 1}. {v.label}
                        </span>
                        <button
                          className="danger"
                          style={{ padding: "2px 6px", fontSize: 10 }}
                          onClick={() => handleRemoveSelectedForFinal(v.path)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-4">
                  <label>Music</label>
                  <select>
                    <option>Whimsical Acoustic</option>
                    <option>Upbeat Pop</option>
                    <option>None (Mute)</option>
                  </select>
                </div>

                <div style={{ marginTop: 8, fontSize: 11 }}>
                  <span style={{ display: "block", marginBottom: 4 }}>Voice sample (optional):</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await window.api.ttsPickPrompt?.();
                        if (result && result.path) {
                          setTtsPromptPath(result.path);
                          setLog((prev) => [...prev, `[TTS] Using prompt: ${result.path}`]);
                        }
                      }}
                      style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                    >
                      Browse WAV
                    </button>
                    <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ttsPromptPath || "None"}
                    </code>
                  </div>
                </div>

                {/* Voiceover text (Advanced Mode) */}
                <div className="mt-4">
                  <label>Voiceover text</label>
                  <textarea
                    rows={3}
                    placeholder="Type narration text here..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px", fontSize: 13, resize: "none", height: 72 }}
                  />
                  {/* Voice sample moved next to narration tools in playlist column */}

                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={ttsManualStyle}
                        onChange={(e) => setTtsManualStyle(e.target.checked)}
                      />
                      Manual style controls
                    </label>
                  </div>

                  {!ttsManualStyle && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Voice style</label>
                      <select
                        value={ttsStyle}
                        onChange={(e) => setTtsStyle(e.target.value as TtsStyle)}
                        style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: 12 }}
                      >
                        <option value="calm">Calm narrator</option>
                        <option value="natural">Natural</option>
                        <option value="hype">Hype / TikTok</option>
                      </select>
                    </div>
                  )}

                  {ttsManualStyle && (
                    <div style={{ marginTop: 8, fontSize: 11 }}>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Exaggeration ({ttsExaggeration.toFixed(2)})</label>
                        <input
                          type="range"
                          min={0.5}
                          max={2.0}
                          step={0.05}
                          value={ttsExaggeration}
                          onChange={(e) => setTtsExaggeration(Number(e.target.value))}
                          style={{
                            width: "100%",
                            background: `linear-gradient(to right, #2563eb ${((ttsExaggeration - 0.5) / (2.0 - 0.5)) * 100}%, #e2e8f0 ${((ttsExaggeration - 0.5) / (2.0 - 0.5)) * 100}%)`,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>CFG weight ({ttsCfgWeight.toFixed(2)})</label>
                        <input
                          type="range"
                          min={0.5}
                          max={3.0}
                          step={0.05}
                          value={ttsCfgWeight}
                          onChange={(e) => setTtsCfgWeight(Number(e.target.value))}
                          style={{
                            width: "100%",
                            background: `linear-gradient(to right, #2563eb ${((ttsCfgWeight - 0.5) / (3.0 - 0.5)) * 100}%, #e2e8f0 ${((ttsCfgWeight - 0.5) / (3.0 - 0.5)) * 100}%)`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleTtsGenerate}
                    disabled={!ttsText.trim() || ttsRunning}
                    style={{ marginTop: 8, width: "100%", background: "#2563eb", color: "white", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {ttsRunning ? "Generating voice..." : "Create Voice"}
                  </button>
                  {ttsOutputPath && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                      Output: <code>{ttsOutputPath}</code>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 15,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label>Max Duration</label>
                  <select
                    value={playlistMaxDurationSeconds}
                    onChange={(e) => setPlaylistMaxDurationSeconds(Number(e.target.value))}
                  >
                    <option value={60}>60s (Shorts)</option>
                    <option value={180}>180s (Standard)</option>
                  </select>
                </div>
                <div>
                  <label>Clip Cut (Sec)</label>
                  <input
                    type="number"
                    value={playlistMaxClipSeconds}
                    onChange={(e) => setPlaylistMaxClipSeconds(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label>Export Format</label>
                  <select>
                    <option>MP4 - 1080p</option>
                    <option>MP4 - 4K</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#f8fafc",
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 12 }}>
                  <div className="mb-4" style={{ display: "flex", gap: 12 }}>
                    <span>
                      <span className="status-dot status-active" /> download: {steps.download}
                    </span>
                    <span>
                      <span className="status-dot" /> Editor: {steps.editor}
                    </span>
                  </div>
                  <span style={{ color: "#64748b" }}>
                    Output: {folderOverride || "C:/Users/Admin/.openclaw/workspace/AVM/Audio/VoiceGenerated"}
                  </span>
                </div>
                <button
                  style={{ background: "#22c55e", padding: "12px 24px", fontSize: 14 }}
                  onClick={handleBuildFinalFromSelected}
                  disabled={selectedForFinal.length === 0}
                >
                  Build Final Video
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: FINAL OUTPUT */}
        <div className="right-col">
          <section>
            <h2>Final Export</h2>
            {finalFileUrl ? (
              <video
                src={finalFileUrl}
                controls
                style={{ width: "100%", maxHeight: 220, background: "#000", borderRadius: 8 }}
              />
            ) : (
              <div className="final-video-card">
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Ready to Save</p>
                <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>
                  Add clips, then click 'Build Final Video'.
                </p>
              </div>
            )}

            <div className="mt-4" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="secondary"
                style={{ width: "100%" }}
                disabled={!finalPath}
                onClick={handleOpenFolder}
              >
                Open in Explorer
              </button>
              <button
                style={{ width: "100%" }}
                disabled={!finalPath || !selectedGeneratedVoice}
                onClick={handleBurnSubtitlesWithVosk}
              >
                Add Subtitles to Final Video
              </button>
            </div>
          </section>

          <section className="mt-4" style={{ background: "linear-gradient(145deg, #ffffff, #f1f5f9)" }}>
            <h2 style={{ color: "#2563eb" }}>Quick Stats</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  background: "white",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedForFinal.length}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>Clips in Playlist</div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>--:--</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>Total Length (est.)</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );

  const renderExportDialog = () => {
    if (!exportDialogOpen || !editorTimeline) return null;
    const hasVideoClips = editorTimeline.some(c => (c as any).track === 0);
    const disabled = exporting || !hasVideoClips;

    const qualityLabel =
      exportQuality === "draft" ? "Faster export, smaller file" :
      exportQuality === "high"  ? "Best quality, larger file"   :
                                   "Balanced quality and size";

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <div
          style={{
            width: 620,
            background: "#020617",
            borderRadius: 16,
            border: "1px solid #1f2937",
            color: "#e5e7eb",
            padding: 22,
            boxShadow: "0 22px 70px rgba(0,0,0,0.85)",
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#e5e7eb",
                }}
              >
                Save video to computer
              </h2>
              {downloadFolder && (
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  Output folder: {downloadFolder}
                </span>
              )}
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#9ca3af" }}>
              Standard export for social / YouTube videos. Choose a preset, then adjust advanced
              settings if needed.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            {/* Left: Destination & basic info */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  background: "#020617",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  padding: 10,
                }}
              >
                <label style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Title</label>
                <input
                  type="text"
                  value={exportDialogTitle}
                  onChange={(e) => setExportDialogTitle(e.target.value)}
                  disabled={disabled}
                  style={{
                    background: "#020617",
                    color: "#f9fafb",
                    borderRadius: 8,
                    border: "1px solid #111827",
                    fontSize: 13,
                    padding: "7px 10px",
                  }}
                />
              </div>

              <div
                style={{
                  background: "#020617",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  padding: 10,
                }}
              >
                <label style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Save to</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    style={{
                      flex: 1,
                      background: "#020617",
                      color: downloadFolder ? "#e5e7eb" : "#4b5563",
                      borderRadius: 8,
                      border: "1px solid #111827",
                      fontSize: 12,
                      padding: "7px 10px",
                    }}
                    value={downloadFolder || "Choose a folder"}
                    readOnly
                  />
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={async () => {
                      const result = await window.api.pickTargetFolder?.();
                      if (result && result.folder) {
                        setDownloadFolder(result.folder);
                      }
                    }}
                    style={{
                      background: "#020617",
                      color: "#e5e7eb",
                      borderRadius: 8,
                      border: "1px solid #1f2937",
                      padding: "7px 14px",
                      fontSize: 12,
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "#020617",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  padding: 10,
                }}
              >
                <label style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Resolution preset</label>
                <select
                  value={exportResolution}
                  onChange={(e) => setExportResolution(e.target.value)}
                  disabled={disabled}
                  style={{
                    background: "#020617",
                    color: "#f9fafb",
                    borderRadius: 8,
                    border: "1px solid #111827",
                    fontSize: 12,
                    padding: "7px 10px",
                  }}
                >
                  {/* Vertical 9:16 â€“ Shorts / Reels / TikTok */}
                  <optgroup label="Vertical 9:16 (phone)">
                    <option value="3840x2160">3840Ã—2160 (4K Vertical, cropped)</option>
                    <option value="2560x1440">2560Ã—1440 (QHD Vertical, cropped)</option>
                    <option value="1920x1080">1920Ã—1080 (Full HD Vertical, cropped)</option>
                    <option value="1080x1920">1080Ã—1920 (Full HD Vertical)</option>
                    <option value="720x1280">720Ã—1280 (HD Vertical)</option>
                  </optgroup>

                  {/* Horizontal 16:9 â€“ YouTube / desktop */}
                  <optgroup label="Horizontal 16:9 (monitor)">
                    <option value="3840x2160">3840Ã—2160 (4K UHD)</option>
                    <option value="2560x1440">2560Ã—1440 (QHD/WQHD)</option>
                    <option value="1920x1080">1920Ã—1080 (Full HD)</option>
                    <option value="1600x900">1600Ã—900 (HD+)</option>
                    <option value="1280x720">1280Ã—720 (HD)</option>
                    <option value="640x360">640Ã—360 (SD)</option>
                  </optgroup>

                  {/* Other common ratios */}
                  <optgroup label="Other ratios">
                    {/* 16:10 */}
                    <option value="2560x1600">2560Ã—1600 (16:10 WQXGA)</option>
                    <option value="1920x1200">1920Ã—1200 (16:10)</option>

                    {/* 4:3 classic */}
                    <option value="1600x1200">1600Ã—1200 (4:3)</option>
                    <option value="1280x960">1280Ã—960 (4:3)</option>
                    <option value="1024x768">1024Ã—768 (4:3)</option>

                    {/* 21:9 ultrawide */}
                    <option value="3440x1440">3440Ã—1440 (21:9 ultrawide)</option>
                    <option value="2560x1080">2560Ã—1080 (21:9 ultrawide)</option>

                    {/* Square / Instagram feed */}
                    <option value="1080x1080">1080Ã—1080 (1:1 Square)</option>

                    {/* 4:5 Instagram portrait */}
                    <option value="1080x1350">1080Ã—1350 (4:5 Vertical)</option>
                  </optgroup>
                </select>
                <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                  Resolution: <strong>{exportResolution}</strong>
                </div>
              </div>
            </div>

            {/* Right: Quality + summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  background: "#020617",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  padding: 10,
                }}
              >
                <label style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Quality</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {["draft", "good", "high"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={disabled}
                      onClick={() => setExportQuality(q as any)}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: 999,
                        border: exportQuality === q ? "1px solid #22c55e" : "1px solid #1f2937",
                        background:
                          exportQuality === q ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#020617",
                        color: exportQuality === q ? "#022c22" : "#e5e7eb",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: disabled ? "default" : "pointer",
                      }}
                    >
                      {q === "draft" ? "Draft" : q === "good" ? "Good" : "High"}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>{qualityLabel}</div>
              </div>

              <div
                style={{
                  background: "#020617",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  padding: 10,
                  fontSize: 11,
                  color: "#9ca3af",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Codec</span>
                  <span style={{ color: "#e5e7eb" }}>{exportCodec}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Frame rate</span>
                  <span style={{ color: "#e5e7eb" }}>{exportFps || "29.97"} fps</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Audio</span>
                  <span style={{ color: "#e5e7eb" }}>
                    {exportSampleRate === "48000" ? "48 kHz" : "44.1 kHz"} Â· {exportAudioChannels === "mono" ? "Mono" : "Stereo"}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>
                  Estimated size: <span style={{ color: "#e5e7eb" }}>30â€“90 MB</span>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => setExportAdvancedOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "#9ca3af",
                fontSize: 11,
                padding: 0,
                textDecoration: "underline",
                cursor: disabled ? "default" : "pointer",
              }}
            >
              Advanced settingsâ€¦
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="secondary"
                disabled={exporting}
                onClick={() => setExportDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={disabled || !downloadFolder}
                title={!hasVideoClips ? "Add to video clips to Video 1 before exporting" : undefined}
                onClick={async () => {
                  if (!downloadFolder || !editorTimeline || !hasVideoClips) return;
                  setExporting(true);
                  setLog((prev) => [...prev, "[EXPORT] Starting render..."]);

                  try {
                    const result = await window.api.exportTimeline?.({
                      clips: editorTimeline,
                      textClips: editorTextClips ?? [],
                      outputFolder: downloadFolder,
                      quality: exportQuality,
                      resolution: exportResolution,
                      title: exportDialogTitle || topicTag || "New project",
                      codec: exportCodec,
                      fps: exportFps,
                      bitrateMode: exportBitrateMode,
                      qualitySlider: exportQualitySlider,
                      sampleRate: exportSampleRate,
                      audioChannels: exportAudioChannels,
                    } as any);

                    if (result?.outputPath) {
                      setFinalPath(result.outputPath);
                      setLog((prev) => [
                        ...prev,
                        `[EXPORT] Done: ${result.outputPath}`,
                      ]);
                    }
                  } catch (err: any) {
                    setLog((prev) => [
                      ...prev,
                      `[EXPORT ERROR] ${err.message || String(err)}`,
                    ]);
                  } finally {
                    setExporting(false);
                    setExportDialogOpen(false);
                  }
                }}
              >
                {exporting ? "Exportingâ€¦" : "Start"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAdvancedDialog = () => {
    if (!exportAdvancedOpen) return null;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
        }}
      >
        <div
          style={{
            width: 520,
            maxHeight: 600,
            overflow: "auto",
            background: "#020617",
            borderRadius: 12,
            border: "1px solid #1f2937",
            color: "#e5e7eb",
            padding: 20,
            boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15 }}>Advanced export settings</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Video</div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>Video codec</label>
              <select
                value={exportCodec}
                onChange={(e) => setExportCodec(e.target.value)}
                style={{ background: "#020617", color: "#f9fafb", borderColor: "#111827" }}
              >
                <option>H.264</option>
                <option>H.265</option>
                <option>VP9</option>
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>Resolution</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min={320}
                  max={3840}
                  value={parseInt(exportResolution.split("x")[0], 10) || 1080}
                  onChange={(e) => {
                    const h = e.target.value || "1080";
                    const w = exportResolution.split("x")[1] || "1920";
                    setExportResolution(`${h}x${w}`);
                  }}
                  style={{ width: "40%", background: "#020617", color: "#f9fafb", borderColor: "#111827" }}
                />
                <span style={{ alignSelf: "center" }}>Ã—</span>
                <input
                  type="number"
                  min={320}
                  max={3840}
                  value={parseInt(exportResolution.split("x")[1], 10) || 1920}
                  onChange={(e) => {
                    const w = e.target.value || "1920";
                    const h = exportResolution.split("x")[0] || "1080";
                    setExportResolution(`${h}x${w}`);
                  }}
                  style={{ width: "40%", background: "#020617", color: "#f9fafb", borderColor: "#111827" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>Frame rate</label>
              <select
                value={exportFps}
                onChange={(e) => setExportFps(e.target.value)}
                style={{ background: "#020617", color: "#f9fafb", borderColor: "#111827" }}
              >
                <option>24</option>
                <option>25</option>
                <option>29.97</option>
                <option>30</option>
                <option>60</option>
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>Bitrate</label>
              <select
                value={exportBitrateMode}
                onChange={(e) => setExportBitrateMode(e.target.value)}
                style={{ background: "#020617", color: "#f9fafb", borderColor: "#111827" }}
              >
                <option>VBR</option>
                <option>CBR</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12 }}>Quality</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={exportQualitySlider}
                  onChange={(e) => setExportQualitySlider(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: "#9ca3af", width: 60 }}>
                  {exportQualitySlider < 33
                    ? "Low"
                    : exportQualitySlider < 66
                    ? "Medium"
                    : "High"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Audio</div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>Sample rate</label>
              <select
                value={exportSampleRate}
                onChange={(e) => setExportSampleRate(e.target.value)}
                style={{ background: "#020617", color: "#f9fafb", borderColor: "#111827" }}
              >
                <option value="44100">44 100 Hz</option>
                <option value="48000">48 000 Hz</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12 }}>Audio channels</label>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                <label>
                  <input
                    type="radio"
                    name="audio-channels"
                    checked={exportAudioChannels === "stereo"}
                    onChange={() => setExportAudioChannels("stereo")}
                  />
                  &nbsp;Stereo
                </label>
                <label>
                  <input
                    type="radio"
                    name="audio-channels"
                    checked={exportAudioChannels === "mono"}
                    onChange={() => setExportAudioChannels("mono")}
                  />
                  &nbsp;Mono
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <button
              className="secondary"
              style={{ background: "#020617", color: "#e5e7eb", border: "1px solid #1f2937" }}
              onClick={() => {
                setExportCodec("H.264");
                setExportFps("29.97");
                setExportBitrateMode("VBR");
                setExportQualitySlider(50);
                setExportSampleRate("44100");
                setExportAudioChannels("stereo");
              }}
            >
              Restore Defaults
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="secondary"
                onClick={() => setExportAdvancedOpen(false)}
              >
                Cancel
              </button>
              <button onClick={() => setExportAdvancedOpen(false)}>OK</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Classic mode: polished HTML mockup layout
  const renderClassicUI = () => (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em", margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
          ViewMaker
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>v2.4.0 (Stable)</span>
          <button onClick={() => setProMode(true)} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 10px", borderRadius: 8, fontSize: 12, border: "none", cursor: "pointer" }}>Advanced Mode</button>
          <button style={{ background: "#f1f5f9", color: "#475569", padding: "6px 10px", borderRadius: 8, fontSize: 12, border: "none", cursor: "pointer" }}>Preferences</button>
          <button
            onClick={() => setEditorOpen(true)}
            style={{
              background: "linear-gradient(135deg, #1d4ed8, #4f46e5)",
              border: "none",
              color: "white",
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            âœ‚ Open Timeline Editor
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", gap: 20, alignItems: "flex-start" }}>

        {/* LEFT: URLs + Logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 16px 0" }}>Sources &amp; Import</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Paste YouTube links (one per line)</label>
              <textarea rows={4} placeholder="Paste links here..." value={urlsText} onChange={(e) => setUrlsText(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Where to save downloaded clips</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={async () => { const r = await window.api.pickTargetFolder(); if (r) setDownloadFolder(r.folder); }}
                  style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Browse</button>
                <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>{downloadFolder || "C:/Videos/Clips"}</code>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Topic Tag</label>
              <input type="text" placeholder="Auto-generate tags..." value={topicTag} onChange={(e) => setTopicTag(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }} />
            </div>
            <button onClick={handleRun} disabled={!urlsText.trim() || !downloadFolder || running}
              style={{ width: "100%", background: "#2563eb", color: "white", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {running ? "Downloading..." : "Download Clips"}
            </button>
          </section>

          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 16px 0" }}>System Logs</h2>
            <div ref={logContainerRef} onScroll={handleLogScroll}
              style={{ height: 200, overflow: "auto", background: "#0f172a", color: "#94a3b8", padding: 12, borderRadius: 8, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }}>
              {log.length === 0 ? <div>Waiting for actions...</div> : log.map((line, idx) => <div key={idx} style={{ marginBottom: 4 }}>{line}</div>)}
            </div>
          </section>
        </div>

        {/* MIDDLE: Editor */}
        <div>
          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: 0 }}>Composition Workspace</h2>
              <button onClick={() => { setSelectedForFinal([]); setVideos([]); setSelectedVideoIndex(null); }}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>Start Over</button>
            </div>

            <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Use videos from your computer</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={async () => {
                  // Use folder picker (pickTargetFolder) + server-side listing for this Use videos from your computer as well.
                  const folderResult = await window.api.pickTargetFolder?.();
                  if (!folderResult || !folderResult.folder) return;
                  const baseFolder = folderResult.folder as string;

                  const listResult = await window.api.listVideosInFolder?.(baseFolder);
                  const files = listResult?.files ?? [];

                  setFolderOverride(baseFolder);
                  const mapped: ManifestVideo[] = files.map((fullPath: string) => ({
                    url: null,
                    localPath: fullPath,
                    durationSec: 0,
                    resolution: undefined,
                  }));
                  setUseFolderOnly(true);
                  setVideos(mapped);
                  setSelectedVideoIndex(mapped.length ? 0 : null);
                }}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Choose Folder
              </button>
              <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                {folderOverride || "C:/Users/Admin/.openclaw/workspace/AVM/Video/DownloadedVideo"}
              </code>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
                        {/* Player */}
              <div>
                <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", marginBottom: 12, position: "relative" }}>
                  {selectedVideo && selectedVideoFileUrl
                    ? <video src={selectedVideoFileUrl} controls loop={loopSelected} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    : <div style={{ color: "white", display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 12 }}>No video selected</div>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <select value={selectedVideoIndex ?? ""} onChange={(e) => { const i = Number(e.target.value); setSelectedVideoIndex(isNaN(i) ? null : i); }} disabled={videos.length === 0}
                    style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    {videos.length === 0 && <option>Choose a clip you downloaded...</option>}
                    {videos.map((v, i) => <option key={v.localPath} value={i}>{v.localPath.split("\\").pop()}</option>)}
                  </select>
                  <button onClick={handleAddSelectedClipToPlaylist} disabled={videos.length === 0 || selectedVideoIndex == null}
                    style={{ background: "#2563eb", color: "white", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add to video</button>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={loopSelected} onChange={(e) => setLoopSelected(e.target.checked)} /> Repeat preview
                </label>

                {/* Narration selection for final video (Simple Mode layout, under preview) */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #e2e8f0", fontSize: 12, display: "none" }}>
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>Voice for final video</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="radio"
                        style={{ width: "auto" }}
                        checked={narrationMode === "none"}
                        onChange={() => setNarrationMode("none")}
                      />
                      No voice (silent)
                    </label>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          style={{ width: "auto" }}
                          checked={narrationMode === "generated"}
                          onChange={() => setNarrationMode("generated")}
                        />
                        Use voice generated here
                      </label>
                      <div style={{ marginLeft: 20, display: "flex", gap: 6, alignItems: "center" }}>
                        <select
                          disabled={narrationMode !== "generated" || generatedVoices.length === 0}
                          value={selectedGeneratedVoice || ""}
                          onChange={(e) => setSelectedGeneratedVoice(e.target.value || null)}
                          style={{ flex: 1, fontSize: 11 }}
                        >
                          {generatedVoices.length === 0 && <option value="">No generated voices found</option>}
                          {generatedVoices.map((v) => (
                            <option key={v.path} value={v.path}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          style={{ width: "auto" }}
                          checked={narrationMode === "manual"}
                          onChange={() => setNarrationMode("manual")}
                        />
                        Use an audio file from computer
                      </label>
                      <div style={{ marginLeft: 20, display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await window.api.pickNarrationAudio?.();
                            if (result && result.path) {
                              setManualNarrationPath(result.path);
                              setNarrationMode("manual");
                            }
                          }}
                          style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                        >
                          Choose audio file
                        </button>
                        <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {manualNarrationPath || "No file selected"}
                        </code>
                      </div>
                    </div>

                    {/* Caption + subtitle controls remain here; voice sample lives under Simple Mode TTS box */}

                    <div style={{ marginTop: 8, fontSize: 11 }}>
                      <span style={{ display: "block", marginBottom: 4 }}>Voice For Caption:  (optional):</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await window.api.ttsPickVoskJson?.();
                            if (result && result.path) {
                              setVoskJsonPath(result.path);
                              setLog((prev) => [...prev, `[SUB] Using Vosk JSON: ${result.path}`]);
                            }
                          }}
                          style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                        >
                          Choose subtitle JSON
                        </button>
                        <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {voskJsonPath || "Auto from voice (.vosk.json)"}
                        </code>
                      </div>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 11, display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 8 }}>
                      <div>
                        <span style={{ display: "block", marginBottom: 4 }}>Subtitle style</span>
                        <select
                          value={subtitleFont}
                          onChange={(e) => setSubtitleFont(e.target.value)}
                          style={{ width: "100%", fontSize: 11 }}
                        >
                          <option value="System">System default</option>
                          <option value="System">System default</option>
                          <option value="Bungee Tint">Bungee Tint</option>
                          <option value="Coiny">Coiny</option>
                          <option value="DynaPuff">DynaPuff</option>
                          <option value="Knewave">Knewave</option>
                          <option value="Luckiest Guy">Luckiest Guy</option>
                          <option value="Margarine">Margarine</option>
                        </select>
                      </div>
                      <div>
                        <span style={{ display: "block", marginBottom: 4 }}>Size</span>
                        <input
                          type="number"
                          value={subtitleSize}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 0;
                            setSubtitleSize(v > 0 ? v : 1);
                          }}
                          style={{ width: "100%", fontSize: 11 }}
                          min={8}
                          max={120}
                        />
                      </div>
                      <div>
                        <span style={{ display: "block", marginBottom: 4 }}>Color</span>
                        <select
                          value={subtitleColor}
                          onChange={(e) => setSubtitleColor(e.target.value)}
                          style={{ width: "100%", fontSize: 11 }}
                        >
                          <option value="white">White</option>
                          <option value="yellow">Yellow</option>
                          <option value="cyan">Cyan</option>
                        </select>
                      </div>
                      <div>
                        <span style={{ display: "block", marginBottom: 4 }}>Position</span>
                        <select
                          value={subtitlePosition}
                          onChange={(e) => setSubtitlePosition(e.target.value as any)}
                          style={{ width: "100%", fontSize: 11 }}
                        >
                          <option value="bottom">Bottom</option>
                          <option value="middle">Middle</option>
                          <option value="top">Top</option>
                        </select>
                      </div>
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={trimToNarration}
                        onChange={(e) => setTrimToNarration(e.target.checked)}
                      />
                      <span>Trim video to narration length</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Playlist */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Video order</label>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", maxHeight: 250, overflowY: "auto" }}>
                  {selectedForFinal.length === 0
                    ? <div style={{ padding: "10px 12px", fontSize: 13, color: "#64748b" }}>No clips added yet.</div>
                    : selectedForFinal.map((v, idx) => (
                       <div key={v.path}
                        onClick={() => {
                        const vidIdx = videos.findIndex((vid) => vid.localPath === v.path);
                        if (vidIdx >= 0) {
                          setSelectedVideoIndex(vidIdx);
                        } else {
                          // video not in current list â€” add it temporarily so it can be previewed
                          const temp: ManifestVideo = { url: null, localPath: v.path, durationSec: 0, resolution: undefined };
                          setVideos((prev) => {
                            const exists = prev.some((vid) => vid.localPath === v.path);
                            if (exists) return prev;
                            return [...prev, temp];
                          });
                          setSelectedVideoIndex(videos.length); // will point to the newly added item
                        }
                      }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #e2e8f0", fontSize: 13, cursor: "pointer" }}>
                        <span>{idx + 1}. {v.label}</span>
                        <button onClick={() => handleRemoveSelectedForFinal(v.path)}
                          style={{ background: "#fee2e2", color: "#ef4444", border: "none", padding: "2px 6px", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>Remove</button>
                      </div>
                    ))}
                </div>
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Music</label>
                  <select style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <option>Whimsical Acoustic</option>
                    <option>Upbeat Pop</option>
                    <option>None (Mute)</option>
                  </select>
                </div>

                {/* Voiceover text (Simple Mode) */}
                <div style={{ marginTop: 16, display: "none" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Voiceover text</label>
                  <textarea
                    rows={3}
                    placeholder="Type narration text here..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "none", height: 72 }}
                  />
                  {/* Voice sample (optional) directly under Simple Mode TTS */}
                  <div style={{ marginTop: 8, fontSize: 11 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>Voice sample (optional):</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await window.api.ttsPickPrompt?.();
                          if (result && result.path) {
                            setTtsPromptPath(result.path);
                            setLog((prev) => [...prev, `[TTS] Using prompt: ${result.path}`]);
                          }
                        }}
                        style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                      >
                        Browse WAV
                      </button>
                      <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ttsPromptPath || "None"}
                      </code>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, padding: 10, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", fontSize: 12 }}>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Voice for final video</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" style={{ width: "auto" }} checked={narrationMode === "none"} onChange={() => setNarrationMode("none")} />
                        No voice (silent)
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" style={{ width: "auto" }} checked={narrationMode === "generated"} onChange={() => setNarrationMode("generated")} />
                        Use voice generated here
                      </label>
                      <select
                        disabled={narrationMode !== "generated" || generatedVoices.length === 0}
                        value={selectedGeneratedVoice || ""}
                        onChange={(e) => setSelectedGeneratedVoice(e.target.value || null)}
                        style={{ width: "100%", fontSize: 11 }}
                      >
                        {generatedVoices.length === 0 && <option value="">No generated voices found</option>}
                        {generatedVoices.map((v) => (<option key={v.path} value={v.path}>{v.label}</option>))}
                      </select>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" style={{ width: "auto" }} checked={narrationMode === "manual"} onChange={() => setNarrationMode("manual")} />
                        Use an audio file from computer
                      </label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await window.api.pickNarrationAudio?.();
                            if (result && result.path) {
                              setManualNarrationPath(result.path);
                              setNarrationMode("manual");
                            }
                          }}
                          style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                        >
                          Choose audio file
                        </button>
                        <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {manualNarrationPath || "No file selected"}
                        </code>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={ttsManualStyle}
                        onChange={(e) => setTtsManualStyle(e.target.checked)}
                      />
                      Manual style controls
                    </label>
                  </div>

                  {!ttsManualStyle && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Voice style</label>
                      <select
                        value={ttsStyle}
                        onChange={(e) => setTtsStyle(e.target.value as TtsStyle)}
                        style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: 12 }}
                      >
                        <option value="calm">Calm narrator</option>
                        <option value="natural">Natural</option>
                        <option value="hype">Hype / TikTok</option>
                      </select>
                    </div>
                  )}

                  {ttsManualStyle && (
                    <div style={{ marginTop: 8, fontSize: 11 }}>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Exaggeration ({ttsExaggeration.toFixed(2)})</label>
                        <input
                          type="range"
                          min={0.5}
                          max={2.0}
                          step={0.05}
                          value={ttsExaggeration}
                          onChange={(e) => setTtsExaggeration(Number(e.target.value))}
                          style={{
                            width: "100%",
                            background: `linear-gradient(to right, #2563eb ${((ttsExaggeration - 0.5) / (2.0 - 0.5)) * 100}%, #e2e8f0 ${((ttsExaggeration - 0.5) / (2.0 - 0.5)) * 100}%)`,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>CFG weight ({ttsCfgWeight.toFixed(2)})</label>
                        <input
                          type="range"
                          min={0.5}
                          max={3.0}
                          step={0.05}
                          value={ttsCfgWeight}
                          onChange={(e) => setTtsCfgWeight(Number(e.target.value))}
                          style={{
                            width: "100%",
                            background: `linear-gradient(to right, #2563eb ${((ttsCfgWeight - 0.5) / (3.0 - 0.5)) * 100}%, #e2e8f0 ${((ttsCfgWeight - 0.5) / (3.0 - 0.5)) * 100}%)`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleTtsGenerate}
                    disabled={!ttsText.trim() || ttsRunning}
                    style={{ marginTop: 8, width: "100%", background: "#2563eb", color: "white", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {ttsRunning ? "Generating voice..." : "Create Voice"}
                  </button>
                  {ttsOutputPath && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                      Output: <code>{ttsOutputPath}</code>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 15, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Max Duration</label>
                  <select value={playlistMaxDurationSeconds} onChange={(e) => setPlaylistMaxDurationSeconds(Number(e.target.value))}
                    style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <option value={30}>30s</option>
                    <option value={60}>60s (Shorts)</option>
                    <option value={180}>180s (Standard)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Clip Cut (Sec)</label>
                  <input type="number" value={playlistMaxClipSeconds} onChange={(e) => setPlaylistMaxClipSeconds(Number(e.target.value) || 0)}
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Export Format</label>
                  <select style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <option>MP4 - 1080p</option>
                    <option>MP4 - 4K</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                    <span><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", marginRight: 4, boxShadow: "0 0 8px #22c55e" }} />download: {steps.download}</span>
                    <span><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#cbd5e1", display: "inline-block", marginRight: 4 }} />Editor: {steps.editor}</span>
                  </div>
                  <span style={{ color: "#64748b" }}>Output: {folderOverride || "C:/Users/Admin/.openclaw/workspace/AVM/Video/DownloadedVideo"}</span>
                </div>
                <button onClick={handleBuildFinalFromSelected} disabled={selectedForFinal.length === 0}
                  style={{ background: "#22c55e", color: "white", border: "none", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Build Final Video
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT: Final video */}
        <div>
          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 16px 0" }}>Final Export</h2>
            {finalFileUrl
              ? <video src={finalFileUrl} controls style={{ width: "100%", maxHeight: 220, background: "#000", borderRadius: 8 }} />
              : <div style={{ background: "#f1f5f9", border: "2px dashed #cbd5e1", borderRadius: 12, height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b", textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Ready to Save</p>
                  <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>Add clips, then click 'Build Final Video'.</p>
                </div>}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                style={{ width: "100%", background: "#f1f5f9", color: "#475569", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                onClick={async () => {
                  const result = await window.api.pickFinalVideo?.();
                  if (result && result.path) {
                    setFinalPath(result.path);
                    setLog((prev) => [...prev, `[UI] Loaded existing final video: ${result.path}`]);
                  }
                }}
              >
                Open Existing Final Video
              </button>
              <button style={{ width: "100%", background: "#f1f5f9", color: "#475569", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} disabled={!finalPath}>
                Save Final Video As...
              </button>
              <button onClick={handleOpenFolder} disabled={!finalPath}
                style={{ width: "100%", background: "#f1f5f9", color: "#475569", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                Open in Explorer
              </button>
              <button
                onClick={handleBurnSubtitlesWithVosk}
                disabled={!finalPath || !selectedGeneratedVoice}
                style={{ width: "100%", background: "#2563eb", color: "white", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: finalPath && selectedGeneratedVoice ? "pointer" : "default" }}
              >
                Add Subtitles to Final Video
              </button>
            </div>
          </section>

          <section style={{ marginTop: 16, background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 12px 0" }}>Voiceover</h2>
            <textarea
              rows={3}
              placeholder="Type narration text here..."
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "none", height: 72 }}
            />
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Voice sample (optional):</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await window.api.ttsPickPrompt?.();
                    if (result && result.path) {
                      setTtsPromptPath(result.path);
                      setLog((prev) => [...prev, `[TTS] Using prompt: ${result.path}`]);
                    }
                  }}
                  style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                >
                  Browse WAV
                </button>
                <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ttsPromptPath || "None"}
                </code>
              </div>
            </div>
            <button onClick={handleTtsGenerate} disabled={!ttsText.trim() || ttsRunning}
              style={{ marginTop: 10, width: "100%", background: "#2563eb", color: "white", border: "none", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {ttsRunning ? "Generating voice..." : "Create Voice"}
            </button>
            {ttsOutputPath && <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>Saved: {ttsOutputPath.split(/[\\/]/).pop()}</div>}
          </section>

          <section style={{ marginTop: 16, background: "linear-gradient(145deg, #ffffff, #f1f5f9)", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#2563eb", margin: "0 0 16px 0" }}>Quick Stats</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, textAlign: "center" }}>
              <div style={{ background: "white", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedForFinal.length}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>Clips in Playlist</div>
              </div>
              <div style={{ background: "white", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>--:--</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>Total Length (est.)</div>
              </div>
            </div>
          </section>
        </div>

      </div>
    </>
  );

  return editorOpen ? (
        <VideoEditor
        clips={videos.map(v => ({
          path: v.localPath,
          label: v.localPath.split(/[\\/]/).pop() ?? v.localPath,
        }))}
        savedTimeline={savedEditorTimeline.current ?? undefined}
        savedTextClips={savedEditorTextClips.current ?? undefined}
        onExport={(arrangedClips, textClips) => {
          // Keep the editor open; just show export dialog on top
          savedEditorTimeline.current = arrangedClips;
          savedEditorTextClips.current = textClips;
          setEditorTimeline(arrangedClips);
          setEditorTextClips(textClips);
          setExportDialogTitle(topicTag || "New project");
          setExportDialogOpen(true);
        }}
        onClose={(currentClips, textClips) => {
          savedEditorTimeline.current = currentClips;
          savedEditorTextClips.current = textClips;
          // Also persist into state so the App export dialog sees the latest clips
          setEditorTimeline(currentClips);
          setEditorTextClips(textClips);
          setEditorOpen(false);
        }}
      />
  ) : (
    <div id="app" style={{ maxWidth: 1400, margin: "0 auto", padding: 24, background: "#f8fafc", minHeight: "100vh", borderRadius: 12 }}>
      <style>
        {`
        :root {
          --bg-main: #f8fafc;
          --bg-card: #ffffff;
          --primary: #2563eb;
          --primary-hover: #1d4ed8;
          --secondary: #64748b;
          --accent: #22c55e;
          --danger: #ef4444;
          --border: #e2e8f0;
          --text-main: #1e293b;
          --text-muted: #64748b;
          --radius: 12px;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        body {
          background: var(--bg-main);
          color: var(--text-main);
          margin: 0;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        section {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
          box-shadow: var(--shadow);
        }
        h2 {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin: 0 0 16px 0;
        }
        label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 6px;
          color: var(--text-main);
        }
        input, textarea, select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          background: #fff;
        }
        button {
          background: var(--primary);
          border: none;
          color: white;
          padding: 10px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }
        button.secondary {
          background: #f1f5f9;
          color: #475569;
        }
        button.danger {
          background: #fee2e2;
          color: var(--danger);
        }
        .flex-row { display: flex; gap: 8px; align-items: center; }
        .mb-4 { margin-bottom: 16px; }
        .mt-4 { margin-top: 16px; }
        .logBox {
          height: 200px;
          overflow: auto;
          background: #0f172a;
          color: #94a3b8;
          padding: 12px;
          border-radius: 8px;
          font-family: 'Fira Code', monospace;
          font-size: 11px;
          line-height: 1.5;
        }
        .log-entry { margin-bottom: 4px; }
        .video-preview-wrapper {
          background: #000;
          border-radius: 12px;
          overflow: hidden;
          aspect-ratio: 16/9;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .video-preview-wrapper video { width: 100%; height: 100%; object-fit: contain; }
        .playlist-container {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #f8fafc;
          max-height: 250px;
          overflow-y: auto;
        }
        .playlist-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        .playlist-item:last-child { border-bottom: none; }
        .final-video-card {
          background: #f1f5f9;
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          height: 200px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          text-align: center;
          padding: 20px;
        }
        .status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #cbd5e1; display: inline-block; margin-right: 4px;
        }
        .status-active { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
        `}
      </style>

      {proMode ? renderProUI() : renderClassicUI()}

      {renderExportDialog()}
      {renderAdvancedDialog()}
    </div>
  );
};




