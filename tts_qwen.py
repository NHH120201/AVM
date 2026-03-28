import sys
import json
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

with open(sys.argv[1], "r", encoding="utf-8") as f:
    args = json.load(f)

text = args["text"]
voice = args.get("voice", "Ryan")
instruct = args.get("instruct", "")
output_path = args["output"]

model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    device_map="cuda:0",
    dtype=torch.bfloat16,
)

wavs, sr = model.generate_custom_voice(
    text=text,
    speaker=voice,
    instruct=instruct if instruct else None,
)

sf.write(output_path, wavs[0], sr)
print(f"[TTS] Saved to {output_path}")