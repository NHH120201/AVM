import argparse
import os
import sys

import torch
import torchaudio as ta

try:
    from chatterbox.tts_turbo import ChatterboxTurboTTS
except ImportError:
    print("ERROR: chatterbox-tts is not installed. Run: pip install chatterbox-tts", file=sys.stderr)
    sys.exit(1)


def chunk_text(text: str, max_chars: int = 500) -> list[str]:
    """Split long text into reasonably sized chunks by paragraphs and sentences.

    This keeps each generation manageable while still returning a single final file.
    """
    # First split by blank lines as paragraphs
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks: list[str] = []
    current = ""

    for p in paragraphs:
        if not current:
            current = p
            continue
        if len(current) + 1 + len(p) <= max_chars:
            current = current + "\n" + p
        else:
            chunks.append(current)
            current = p
    if current:
        chunks.append(current)

    # If still somehow tiny or huge, just fall back to raw text as a single chunk
    if not chunks:
        return [text]
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate speech with Chatterbox-Turbo")
    parser.add_argument("text", type=str, help="Text to speak")
    parser.add_argument("output", type=str, help="Output WAV path")
    parser.add_argument("--prompt", type=str, default=None, help="Optional reference audio clip for voice cloning")
    parser.add_argument("--exaggeration", type=float, default=1.0, help="Style exaggeration factor")
    parser.add_argument("--cfg_weight", type=float, default=2.0, help="Classifier-free guidance weight")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Loading Chatterbox-Turbo on {device}...", flush=True)
    model = ChatterboxTurboTTS.from_pretrained(device=device)

    gen_kwargs = {}
    if args.prompt:
        if not os.path.exists(args.prompt):
            print(f"ERROR: prompt file not found: {args.prompt}", file=sys.stderr)
            sys.exit(1)
        gen_kwargs["audio_prompt_path"] = args.prompt

    # Split long text into chunks but return a single final file
    chunks = chunk_text(args.text, max_chars=600)
    print(f"[INFO] Generating audio in {len(chunks)} chunk(s)", flush=True)

    wavs: list[torch.Tensor] = []
    for idx, chunk in enumerate(chunks, start=1):
        print(f"[INFO] Chunk {idx}/{len(chunks)}: {chunk[:80]!r}...", flush=True)
        w = model.generate(
            chunk,
            exaggeration=args.exaggeration,
            cfg_weight=args.cfg_weight,
            **gen_kwargs,
        )
        # Ensure mono [1, T]
        if w.dim() == 1:
            w = w.unsqueeze(0)
        wavs.append(w)

    # Concatenate along time axis
    full_wav = torch.cat(wavs, dim=1)

    out_dir = os.path.dirname(os.path.abspath(args.output))
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    ta.save(args.output, full_wav, model.sr)
    print(f"[INFO] Saved audio to {args.output}", flush=True)


if __name__ == "__main__":
    main()
