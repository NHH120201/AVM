import argparse
import json
import os
import sys
import wave

from vosk import Model, KaldiRecognizer


def transcribe(audio_path: str, model_path: str) -> dict:
  """Transcribe a mono WAV file with Vosk, returning word-level timings.

  Output format:
  {
    "words": [
      {"word": "hello", "start": 0.1, "end": 0.5},
      ...
    ]
  }
  """
  if not os.path.exists(model_path):
    raise RuntimeError(f"Vosk model not found: {model_path}")

  if not os.path.exists(audio_path):
    raise RuntimeError(f"Audio file not found: {audio_path}")

  wf = wave.open(audio_path, "rb")
  if wf.getnchannels() != 1:
    raise RuntimeError("Audio must be mono WAV for Vosk (1 channel)")
  if wf.getsampwidth() != 2:
    raise RuntimeError("Audio must be 16-bit PCM WAV for Vosk")

  rate = wf.getframerate()
  model = Model(model_path)
  rec = KaldiRecognizer(model, rate)
  rec.SetWords(True)

  words = []
  while True:
    data = wf.readframes(4000)
    if len(data) == 0:
      break
    if rec.AcceptWaveform(data):
      part = json.loads(rec.Result())
      if "result" in part:
        words.extend(part["result"])
  final = json.loads(rec.FinalResult())
  if "result" in final:
    words.extend(final["result"])

  # Normalize to a simple list
  normalized = [
    {
      "word": w.get("word", ""),
      "start": float(w.get("start", 0.0)),
      "end": float(w.get("end", 0.0)),
    }
    for w in words
    if w.get("word")
  ]

  return {"words": normalized}


def main() -> None:
  parser = argparse.ArgumentParser(description="Transcribe WAV with Vosk")
  parser.add_argument("audio", help="Input WAV file (mono, 16-bit PCM)")
  parser.add_argument("model", help="Path to Vosk model directory")
  parser.add_argument("output", help="Path to write transcript JSON")
  args = parser.parse_args()

  out = transcribe(args.audio, args.model)
  os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
  with open(args.output, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
  main()
