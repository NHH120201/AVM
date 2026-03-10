import React, { useEffect, useRef, useState } from "react";
import { ManifestVideo } from "./types";

type StepStatus = "pending" | "running" | "done" | "error";

const initialSteps: Record<string, StepStatus> = {
  scraper: "pending",
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
  }, []);

  useEffect(() => {
    const el = logContainerRef.current;
    if (!el) return;
    if (autoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log]);

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
    setSteps({ scraper: "pending", editor: "pending" });
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
      // Download Assets is download-only now; finalPath/reportPath will be null

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
    const folder = finalPath.replace(/\[^\]+$/, "");
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
      const result = await window.api.ttsGenerate({
        text: ttsText.trim(),
        outputPath: "",
        promptPath: ttsPromptPath,
        exaggeration,
        cfgWeight: cfg,
      });
      setTtsOutputPath(result.outputPath);
      setLog((prev) => [...prev, `[TTS] Generated: ${result.outputPath}`]);
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

    const result = await window.api.buildFinalFromSelected({
      topic,
      items: selectedForFinal,
      maxClipSeconds: maxClip,
      maxDurationSeconds: maxDuration,
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
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span role="img" aria-label="paw">🐾</span>
          Animal Video Maker
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
            Classic
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
            Settings
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
              <label>YouTube URLs (one per line)</label>
              <textarea
                rows={4}
                placeholder="https://youtube.com/..."
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Target Folder</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="secondary"
                  style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
                  onClick={async () => {
                    const result = await window.api.pickFolderAndListVideos();
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
              <label>Topic Tag (new folder name)</label>
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
                      const topics = await window.api.listTopicsInFolder(downloadFolder);
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
              {running ? "Downloading..." : "Download Assets"}
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
                <div className="log-entry">[--] Waiting for events...</div>
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
                  Clear All
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Local Folder</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={async () => {
                  const result = await window.api.pickFolderAndListVideos();
                  if (!result) return;
                  const { folder, files } = result;
                  setFolderOverride(folder);
                  const mapped: ManifestVideo[] = files.map((fullPath) => ({
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
                Browse Folder
              </button>
              <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                {folderOverride || "C:/Users/Admin/Videos"}
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
                    {videos.length === 0 && <option>Select a downloaded clip...</option>}
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
                    Add
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
                  Loop Preview
                </label>
              </div>

              {/* Playlist */}
              <div>
                <label>Playlist Sequence</label>
                <div className="playlist-container">
                  {selectedForFinal.length === 0 ? (
                    <div className="playlist-item">
                      <span style={{ color: "#64748b" }}>No clips in playlist.</span>
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
                  <label>Background Music</label>
                  <select>
                    <option>Whimsical Acoustic</option>
                    <option>Upbeat Pop</option>
                    <option>None (Mute)</option>
                  </select>
                </div>

                {/* Text to Speech (Pro layout) */}
                <div className="mt-4">
                  <label>Text to Speech</label>
                  <textarea
                    rows={3}
                    placeholder="Type narration text here..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px", fontSize: 13, resize: "vertical" }}
                  />
                  <div style={{ marginTop: 8, fontSize: 11 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>Voice sample (optional):</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await window.api.ttsPickPrompt();
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
                    {ttsRunning ? "Generating voice..." : "Generate Voice"}
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
                      <span className="status-dot status-active" /> Scraper: {steps.scraper}
                    </span>
                    <span>
                      <span className="status-dot" /> Editor: {steps.editor}
                    </span>
                  </div>
                  <span style={{ color: "#64748b" }}>
                    Output: {folderOverride || "C:/Users/Admin/Videos/Final/"}
                  </span>
                </div>
                <button
                  style={{ background: "#22c55e", padding: "12px 24px", fontSize: 14 }}
                  onClick={handleBuildFinalFromSelected}
                  disabled={selectedForFinal.length === 0}
                >
                  Generate Video
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
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Ready to Export</p>
                <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>
                  Complete the playlist and click 'Generate' to see the result.
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

  // Classic mode: polished HTML mockup layout
  const renderClassicUI = () => (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em", margin: 0, color: "#0f172a", display: "flex", alignItems: "center", gap: 10 }}>
          🐾 Animal Video Maker
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>v2.4.0 (Stable)</span>
          <button onClick={() => setProMode(true)} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 10px", borderRadius: 8, fontSize: 12, border: "none", cursor: "pointer" }}>Go Pro</button>
          <button style={{ background: "#f1f5f9", color: "#475569", padding: "6px 10px", borderRadius: 8, fontSize: 12, border: "none", cursor: "pointer" }}>Settings</button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", gap: 20, alignItems: "flex-start" }}>

        {/* LEFT: URLs + Logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 16px 0" }}>Sources &amp; Import</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>YouTube URLs (one per line)</label>
              <textarea rows={4} placeholder="https://youtube.com/..." value={urlsText} onChange={(e) => setUrlsText(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Target Folder</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={async () => { const r = await window.api.pickFolderAndListVideos(); if (r) setDownloadFolder(r.folder); }}
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
              {running ? "Downloading..." : "Download Assets"}
            </button>
          </section>

          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: "0 0 16px 0" }}>System Logs</h2>
            <div ref={logContainerRef} onScroll={handleLogScroll}
              style={{ height: 200, overflow: "auto", background: "#0f172a", color: "#94a3b8", padding: 12, borderRadius: 8, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }}>
              {log.length === 0 ? <div>[--] Waiting for events...</div> : log.map((line, idx) => <div key={idx} style={{ marginBottom: 4 }}>{line}</div>)}
            </div>
          </section>
        </div>

        {/* MIDDLE: Editor */}
        <div>
          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", margin: 0 }}>Composition Workspace</h2>
              <button onClick={() => { setSelectedForFinal([]); setVideos([]); setSelectedVideoIndex(null); }}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer" }}>Clear All</button>
            </div>

            <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Local Folder</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={async () => {
                  const result = await window.api.pickFolderAndListVideos();
                  if (!result) return;
                  const { folder, files } = result;
                  setFolderOverride(folder);
                  const mapped: ManifestVideo[] = files.map((fullPath) => ({
                    url: null, localPath: fullPath, durationSec: 0, resolution: undefined,
                  }));
                  setUseFolderOnly(true);
                  setVideos(mapped);
                  setSelectedVideoIndex(mapped.length ? 0 : null);
                  
                }}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Browse Folder
              </button>
              <code style={{ fontSize: 10, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis" }}>
                {folderOverride || "C:/Users/Admin/Videos"}
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
                    {videos.length === 0 && <option>Select a downloaded clip...</option>}
                    {videos.map((v, i) => <option key={v.localPath} value={i}>{v.localPath.split("\\").pop()}</option>)}
                  </select>
                  <button onClick={handleAddSelectedClipToPlaylist} disabled={videos.length === 0 || selectedVideoIndex == null}
                    style={{ background: "#2563eb", color: "white", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={loopSelected} onChange={(e) => setLoopSelected(e.target.checked)} /> Loop Preview
                </label>
              </div>

              {/* Playlist */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Playlist Sequence</label>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", maxHeight: 250, overflowY: "auto" }}>
                  {selectedForFinal.length === 0
                    ? <div style={{ padding: "10px 12px", fontSize: 13, color: "#64748b" }}>No clips in playlist.</div>
                    : selectedForFinal.map((v, idx) => (
                       <div key={v.path}
                        onClick={() => {
                        const vidIdx = videos.findIndex((vid) => vid.localPath === v.path);
                        if (vidIdx >= 0) {
                          setSelectedVideoIndex(vidIdx);
                        } else {
                          // video not in current list — add it temporarily so it can be previewed
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
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Background Music</label>
                  <select style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <option>Whimsical Acoustic</option>
                    <option>Upbeat Pop</option>
                    <option>None (Mute)</option>
                  </select>
                </div>

                {/* Text to Speech (Classic) */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Text to Speech</label>
                  <textarea
                    rows={3}
                    placeholder="Type narration text here..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical" }}
                  />
                  <div style={{ marginTop: 8, fontSize: 11 }}>
                    <span style={{ display: "block", marginBottom: 4 }}>Voice sample (optional):</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await window.api.ttsPickPrompt();
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
                    {ttsRunning ? "Generating voice..." : "Generate Voice"}
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
                    <span><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", marginRight: 4, boxShadow: "0 0 8px #22c55e" }} />Scraper: {steps.scraper}</span>
                    <span><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#cbd5e1", display: "inline-block", marginRight: 4 }} />Editor: {steps.editor}</span>
                  </div>
                  <span style={{ color: "#64748b" }}>Output: {folderOverride || "C:/Users/Admin/Videos/Final/"}</span>
                </div>
                <button onClick={handleBuildFinalFromSelected} disabled={selectedForFinal.length === 0}
                  style={{ background: "#22c55e", color: "white", border: "none", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Generate Video
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
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Ready to Export</p>
                  <p style={{ margin: "4px 0 0 0", fontSize: 12 }}>Complete the playlist and click 'Generate' to see the result.</p>
                </div>}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <button style={{ width: "100%", background: "#f1f5f9", color: "#475569", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} disabled={!finalPath}>
                Download Final File
              </button>
              <button onClick={handleOpenFolder} disabled={!finalPath}
                style={{ width: "100%", background: "#f1f5f9", color: "#475569", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                Open in Explorer
              </button>
            </div>
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

  return (
    <div id="app" style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
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
    </div>
  );
};
