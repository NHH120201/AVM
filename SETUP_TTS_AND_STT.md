# AVM – TTS/STT Setup Guide

This documents everything needed for **Generate Voice** + **Burn Vosk Subtitles** to work on a fresh machine.

## 1. System Requirements

- **Python 3.10+** installed
- **Node.js** (already required for AVM)
- **ffmpeg** + **ffprobe** on PATH (or installed where your scripts expect them)
- **yt-dlp** on PATH (for downloads)

## 2. Create Python Environment (recommended)

From the AVM folder:

```bash
cd C:\Users\Admin\.openclaw\workspace\AVM
python -m venv .venv
.\.venv\Scripts\activate
```

Make sure `python` now points to that venv:

```bash
python --version
```

## 3. Install Python Dependencies

Inside the venv, install the TTS + audio stack:

```bash
pip install torch torchaudio chatterbox-tts
```

If you’re on CPU only and the default install fails, use:

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install chatterbox-tts
```

These are required by `tts_chatterbox_turbo.py`:

- `torch`
- `torchaudio`
- `chatterbox-tts`

## 4. Hugging Face Token (for Chatterbox Turbo)

`tts:generate` looks for an HF token in:

1. `HF_TOKEN` environment variable, or
2. A local file in the AVM root: `hf_token.txt`

### Option A – Environment variable

Set `HF_TOKEN` in your shell / system env to your Hugging Face token.

### Option B – `hf_token.txt`

Create a file:

```text
C:\Users\Admin\.openclaw\workspace\AVM\hf_token.txt
```

Put your token in that file (single line, no quotes).

## 5. Vosk STT Model

The STT step (`tts:transcribe`) expects the Vosk English model at:

```text
C:\Users\Admin\.openclaw\workspace\AVM\vosk-model-en-us-0.42-gigaspeech\vosk-model-en-us-0.42-gigaspeech
```

Steps:

1. Download `vosk-model-en-us-0.42-gigaspeech` from the official Vosk releases.
2. Extract it into the AVM root so the path above exists.

## 6. Audio Paths Used by the App

- **Voice sample picker ("Browse WAV")** starts in:
  - `C:\Users\Admin\.openclaw\workspace\AVM\Audio\VoiceSample`

- **Generated voices ("Use generated voice from this tool")** are written to and listed from:
  - `C:\Users\Admin\.openclaw\workspace\AVM\Audio\VoiceGenerated`

- **Vosk JSON subtitles** are written to:
  - `C:\Users\Admin\.openclaw\workspace\AVM\Audio\Subtitles`

The app automatically matches a generated voice WAV with its transcript by basename:

- WAV: `Audio\\VoiceGenerated\\foo.wav`
- JSON: `Audio\\Subtitles\\foo.vosk.json`

## 7. First-time Checklist

1. Install Python 3.10+ and ensure `python` works in a terminal.
2. (Optional) Create and activate `.venv` in the AVM folder.
3. `pip install torch torchaudio chatterbox-tts` (CPU-optimized if needed).
4. Configure HF token via env var or `hf_token.txt`.
5. Download and extract the Vosk model into the expected folder.
6. Verify ffmpeg/ffprobe and yt-dlp are installed.

After this, restart `npm run dev` (or your dev command) so Electron picks up the right environment.
