"""Narration synthesis with Kokoro-82M (local, open-weight neural TTS).

Produces build/voice_raw.wav (24 kHz mono) and build/words.json with
word-level timestamps taken from the model's own phoneme-duration tensor.
"""
import json, re, sys
from pathlib import Path
import numpy as np
import soundfile as sf
import onnx
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)
SR = 24000
HOP = 600  # samples per duration unit

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"

# (text, speed, pause_after_seconds). Text is the approved script verbatim,
# split into the units the edit is built around.
LINES = [
    ("Your microwave doesn't use fire—and it doesn't make food radioactive.", 1.05, 0.42),
    ("It uses invisible electromagnetic waves.", 1.02, 0.40),
    ("A component called a magnetron generates them, and the metal walls reflect them around the oven.", 1.08, 0.36),
    ("When the waves enter your food, their changing electric field makes water molecules continually reorient.", 1.07, 0.40),
    ("That transfers energy into the food as heat.", 1.03, 0.50),
    ("But here's the twist: microwaves don't cook food magically from the inside out.", 1.05, 0.30),
    ("They penetrate only so far; heat then travels inward.", 1.05, 0.42),
    ("That's why some bites are scorching while others stay cold—and why the turntable matters.", 1.02, 0.0),
]


def dur_model():
    src = MODELS / "kokoro-v1.0.onnx"
    dst = MODELS / "kokoro-v1.0-dur.onnx"
    if not dst.exists():
        m = onnx.load(str(src))
        m.graph.output.append(onnx.helper.make_tensor_value_info(
            "/encoder/Cast_output_0", onnx.TensorProto.INT64, None))
        onnx.save(m, str(dst))
    return dst


def words_of(text):
    return re.findall(r"[A-Za-z][A-Za-z']*", text.replace("—", " "))


def synth(k, text, speed):
    ph = k.tokenizer.phonemize(text, "en-us")
    toks = k.tokenizer.tokenize(ph)
    style = k.get_voice_style(VOICE)[len(toks)]
    audio, dur = k.sess.run(None, {
        "tokens": [[0, *toks, 0]], "style": style,
        "speed": np.array([speed], dtype=np.float32)})
    dur = dur[0]
    # map phoneme chars to tokens (tokenizer drops unknown chars)
    vocab = k.tokenizer.vocab
    kept = [c for c in ph if c in vocab]
    assert len(kept) == len(toks)
    starts = np.concatenate([[0], np.cumsum(dur)]) * HOP
    # token i (in kept) occupies frames starts[i+1]..starts[i+2] (offset 1 for BOS)
    spans, cur = [], None
    for i, c in enumerate(kept):
        a, b = starts[i + 1], starts[i + 2]
        if c == " " or c in ".,;:!?—…\"'()":
            if cur: spans.append(cur); cur = None
            continue
        cur = [a, b, c] if cur is None else [cur[0], b, cur[2] + c]
    if cur: spans.append(cur)
    return audio, ph, spans


def align(k, words, spans):
    """Map text words onto phonetic spans; espeak sometimes fuses short
    function words ("from the"), so fused spans are split by phoneme length."""
    plen = [len(re.sub(r"[ˈˌ.]", "", k.tokenizer.phonemize(w, "en-us").strip())) for w in words]
    out, i = [], 0
    for j, (a, b, chars) in enumerate(spans):
        target = len(re.sub(r"[ˈˌ]", "", chars))
        group, tot = [i], plen[i]; i += 1
        while i < len(words) and len(words) - i > len(spans) - j - 1 and tot < target - 1:
            group.append(i); tot += plen[i]; i += 1
        t = a
        for g in group:
            e = t + (b - a) * plen[g] / tot
            out.append((t, e)); t = e
    assert i == len(words), (i, len(words))
    return out


def main():
    k = Kokoro(str(dur_model()), str(MODELS / "voices-v1.0.bin"))
    out, words, lines = [], [], []
    t = 0.0
    lead = 0.20  # breath of silence before the first word
    out.append(np.zeros(int(lead * SR), np.float32)); t = lead
    for li, (text, speed, pause) in enumerate(LINES):
        audio, ph, spans = synth(k, text, speed)
        tw = words_of(text)
        spans = align(k, tw, spans)
        # trim model's leading/trailing silence using word spans
        a0 = max(0, int(spans[0][0]) - int(0.04 * SR))
        a1 = min(len(audio), int(spans[-1][1]) + int(0.12 * SR))
        seg = audio[a0:a1].astype(np.float32)
        for w, (s, e) in zip(tw, spans):
            words.append({"w": w, "line": li, "s": round(t + (s - a0) / SR, 3), "e": round(t + (e - a0) / SR, 3)})
        lines.append({"text": text, "s": round(t, 3), "e": round(t + len(seg) / SR, 3), "ph": ph})
        out.append(seg); t += len(seg) / SR
        out.append(np.zeros(int(pause * SR), np.float32)); t += pause
    voice = np.concatenate(out)
    sf.write(BUILD / "voice_raw.wav", voice, SR, subtype="FLOAT")
    json.dump({"voice": VOICE, "duration": len(voice) / SR, "lines": lines, "words": words},
              open(BUILD / "words.json", "w"), indent=1)
    for l in lines: print(f"{l['s']:6.2f}-{l['e']:6.2f}  {l['text']}\n        {l['ph']}")
    print("TOTAL", round(len(voice) / SR, 2), "s")


if __name__ == "__main__":
    main()
