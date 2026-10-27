"""Procedural score, sound design and final mix.

Reads build/voice_raw.wav + build/words.json, writes build/mix.wav (48 kHz stereo)
and stems in build/stems/. Everything is synthesised here (no third-party audio).
"""
import json, subprocess, re
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

ROOT = Path(__file__).resolve().parent.parent
B = ROOT / "build"; (B / "stems").mkdir(parents=True, exist_ok=True)
SR = 48000
DUR = 40.0
N = int(SR * DUR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(2450)

words = json.load(open(B / "words.json"))
def W(w, n=1, key="s"):
    c = 0
    for x in words["words"]:
        if x["w"].lower() == w.lower():
            c += 1
            if c == n: return x[key]
    raise KeyError(w)

T = dict(fire=W("fire"), radio=W("radioactive"), uses=W("uses"), magnetron=W("magnetron"), generates=W("generates"),
         reflect=W("reflect"), when=W("When"), field=W("field"), water=W("water"), transfers=W("transfers"),
         heat1=W("heat", 1), but=W("But"), twist=W("twist"), mw2=W("microwaves", 1), they=W("They"),
         heat2=W("heat", 2), scorching=W("scorching"), cold=W("cold"), turntable=W("turntable"), matters=W("matters", key="e"))

def db(x): return 10 ** (x / 20)
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def seg(t0, dur):
    i0 = max(0, int(t0 * SR)); i1 = min(N, int((t0 + dur) * SR)); return i0, i1
def add(buf, x, t0, gain=1.0, pan=0.0):
    """add mono or stereo x at time t0 with equal-power pan (-1..1)"""
    i0 = int(round(t0 * SR))
    if x.ndim == 1:
        a = (pan + 1) * np.pi / 4
        x = np.stack([x * np.cos(a), x * np.sin(a)], 1) * np.sqrt(2)
    j0 = max(0, i0); j1 = min(N, i0 + len(x))
    if j1 > j0: buf[j0:j1] += x[j0 - i0:j1 - i0] * gain
def lp(x, fc, order=2): b, a = signal.butter(order, fc / (SR / 2)); return signal.lfilter(b, a, x, axis=0)
def lp_sweep(x, f1, f2):
    k = np.linspace(0, 1, len(x)); return lp(x, f1) * (1 - k) + lp(x, f2) * k
def hp(x, fc, order=2): b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=0)
def bp(x, f1, f2, order=2): b, a = signal.butter(order, [f1 / (SR / 2), f2 / (SR / 2)], 'band'); return signal.lfilter(b, a, x, axis=0)
def adsr(n, a, r, curve=2.0):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na) ** curve
    e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e
def peaking(x, f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)

def reverb_ir(rt=2.2, pre=0.02, seed=1, bright=6000):
    n = int(SR * rt * 1.2); r = np.random.default_rng(seed)
    tt = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-6.9 * tt / rt)[:, None]
    ir = lp(ir, bright, 1)
    ir = np.concatenate([np.zeros((int(pre * SR), 2)), ir])
    ir[:int(0.004 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))
IR_HALL = reverb_ir(2.4, 0.025, 3, 5500)
IR_ROOM = reverb_ir(0.9, 0.012, 5, 8000)
def verb(x, ir, wet=0.3):
    if x.ndim == 1: x = np.stack([x, x], 1)
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
    return x * (1 - wet) + y * wet

# ---------------------------------------------------------------- music
CH = {  # midi voicings
    "Dm9": [38, 50, 57, 62, 65, 69, 76], "Bbmaj7": [34, 46, 53, 62, 65, 69, 74], "Fmaj7": [41, 48, 57, 60, 64, 69, 72],
    "Cadd9": [36, 48, 55, 62, 64, 67, 74], "Gm9": [43, 50, 58, 62, 65, 69, 74], "Bbmaj9": [34, 46, 53, 60, 62, 65, 69],
    "A7sus4": [33, 45, 52, 57, 62, 64, 67], "A7": [33, 45, 52, 55, 61, 64, 69], "Dm": [38, 50, 57, 62, 65, 69],
    "Dmaj9": [38, 50, 57, 61, 64, 66, 69, 76],
}
PROG = [(0.0, "Dm9"), (T["uses"] - 0.1, "Bbmaj7"), (8.25, "Fmaj7"), (T["reflect"] - 0.4, "Cadd9"), (14.3, "Dm9"),
        (17.6, "Gm9"), (T["transfers"] - 0.05, "Bbmaj9"), (22.9, "A7sus4"), (T["but"] - 0.05, "Dm"), (27.4, "Bbmaj7"),
        (T["they"] - 0.1, "Gm9"), (33.3, "Bbmaj9"), (35.6, "Gm9"), (37.0, "A7sus4"), (37.75, "A7"), (T["matters"] - 0.35, "Dmaj9")]

def pad_voice(f, n, fc_fn, t0, detune_cents, harmonics=26):
    tt = np.arange(n) / SR
    fc = fc_fn(t0 + tt)
    ph0 = rng.uniform(0, 2 * np.pi)
    out = np.zeros(n)
    fd = f * 2 ** (detune_cents / 1200)
    vib = 1 + 0.0025 * np.sin(2 * np.pi * 0.21 * tt + ph0)
    phase = 2 * np.pi * np.cumsum(fd * vib) / SR + ph0
    for k in range(1, harmonics + 1):
        if fd * k > 15000: break
        g = (1 / k ** 1.15) / np.sqrt(1 + (fd * k / fc) ** 4)
        out += g * np.sin(k * phase)
    return out

def cutoff(tt):
    base = 700 + 500 * np.sin(2 * np.pi * tt / 19.0) ** 2
    base += 900 * np.clip((tt - 14) / 6, 0, 1) * np.clip((24.3 - tt) / 1.0, 0, 1)  # brighter in molecule section
    base += 1100 * np.clip((tt - 29.5) / 4, 0, 1)
    base -= 450 * np.clip((tt - 24.2) / 0.3, 0, 1) * np.clip((26.5 - tt) / 1.5, 0, 1)  # darker after the twist
    return np.maximum(base, 300)

music = np.zeros((N, 2))
pads = np.zeros((N, 2))
for i, (t0, name) in enumerate(PROG):
    t1 = PROG[i + 1][0] if i + 1 < len(PROG) else DUR
    rel = 1.4 if i + 1 < len(PROG) else 0.0
    dur = min(DUR - t0, t1 - t0 + rel)
    n = int(dur * SR)
    for m in CH[name]:
        f = mtof(m + 12)  # voicings are written an octave low
        lvl = 0.55 if m < 45 else (0.9 if m < 70 else 0.6)
        for det, pan in ((-7, -0.55), (6, 0.55), (0, 0.0)):
            v = pad_voice(f, n, cutoff, t0, det) * lvl
            if i + 1 < len(PROG):
                e = adsr(n, 0.9 if i else 0.25, rel)
            else:  # final chord: natural exponential decay to silence by 40 s
                tt = np.arange(n) / SR
                e = (1 - np.exp(-tt / 0.15)) * np.exp(-tt / 0.55) * np.clip((DUR - 0.02 - (t0 + tt)) / 0.3, 0, 1)
            add(pads, v * e, t0, 0.018, pan)
music += pads

# sub bass (roots), soft
sub = np.zeros(N)
for i, (t0, name) in enumerate(PROG):
    t1 = PROG[i + 1][0] if i + 1 < len(PROG) else DUR
    f = mtof(CH[name][0] + 12)
    n = int((min(DUR, t1 + 0.6) - t0) * SR); tt = np.arange(n) / SR
    v = np.sin(2 * np.pi * f * tt) + 0.15 * np.sin(4 * np.pi * f * tt)
    e = adsr(n, 0.5, 0.6)
    if i + 1 == len(PROG): e *= np.exp(-tt / 0.5)
    i0 = int(t0 * SR); mm = min(N - i0, n); sub[i0:i0 + mm] += (v * e)[:mm]
subg = np.interp(t_all, [0, 2, 4.8, 14, 16, 24.2, 24.4, 26, 33, 38, 40], [0.5, 0.35, 0.35, 0.5, 0.6, 0.6, 0.15, 0.5, 0.55, 0.45, 0.4])
music += np.stack([sub, sub], 1) * (subg * 0.09)[:, None]

# pulsing plucks (16ths at 96 bpm), chord tones, ping-pong
BPM = 96; step = 60 / BPM / 4
plucks = np.zeros((N, 2))
pl_len = int(0.45 * SR); ptt = np.arange(pl_len) / SR
def chord_at(t):
    c = PROG[0][1]
    for t0, name in PROG:
        if t >= t0: c = name
    return c
pattern = [0, 2, 1, 3, 2, 4, 1, 3]
k = 0; tcur = 4.85
pul_lvl = lambda t: np.interp(t, [4.8, 6, 14, 16.2, 21, 23.6, 24.25, 25.6, 26.5, 33, 36.5, 37.9], [0, .45, .5, .85, .9, .7, 0, 0, .6, .75, .5, 0])
while tcur < 38.0:
    lv = float(pul_lvl(tcur))
    if lv > 0.01:
        tones = sorted(m for m in CH[chord_at(tcur)] if m >= 50)
        m = tones[pattern[k % len(pattern)] % len(tones)] + 12
        f = mtof(m)
        acc = 1.0 if k % 4 == 0 else (0.7 if k % 2 == 0 else 0.5)
        x = (np.sin(2 * np.pi * f * ptt) + 0.3 * np.sin(4 * np.pi * f * ptt) * np.exp(-ptt / 0.05)) * np.exp(-ptt / 0.16)
        x *= np.minimum(1, ptt / 0.003)
        add(plucks, x, tcur, 0.05 * lv * acc, -0.45 if k % 2 == 0 else 0.45)
    tcur += step; k += 1
plucks = lp(plucks, 4200, 2)
# tempo-synced ping-pong delay (dotted 8th)
dly = int(step * 3 * SR)
fb = np.zeros_like(plucks)
fb[dly:, 0] += plucks[:-dly, 1] * 0.35; fb[dly:, 1] += plucks[:-dly, 0] * 0.35
fb[2 * dly:] += plucks[:-2 * dly] * 0.15
music += plucks + lp(fb, 2500, 1)
music = verb(music, IR_HALL, 0.32)

# ---------------------------------------------------------------- sound design
sfx = np.zeros((N, 2))
def noise(d): return rng.standard_normal(int(d * SR))
def tt_(d): return np.arange(int(d * SR)) / SR

def impact(t0, gain):  # opening low impact, restrained
    d = 2.2; tt = tt_(d)
    f = 34 + 30 * np.exp(-tt / 0.12)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.55)
    click = lp(noise(d), 1800) * np.exp(-tt / 0.03) * 0.6
    air = bp(noise(d), 300, 2500) * np.exp(-tt / 0.35) * 0.18
    add(sfx, verb(body + click + air, IR_HALL, 0.35), t0, gain)

def bell(t0, f0, gain, pan=0.0, decay=1.6, partials=(1, 2.76, 5.40, 8.93), wet=0.45):
    d = decay * 2.5; tt = tt_(d); x = np.zeros_like(tt)
    for i, p in enumerate(partials):
        x += np.sin(2 * np.pi * f0 * p * tt + i) * np.exp(-tt / (decay / (1 + i * 0.7))) / (1 + i)
    x *= np.minimum(1, tt / 0.002)
    add(sfx, verb(x, IR_HALL, wet), t0, gain, pan)

def whoosh(t0, d, gain, f1=300, f2=3000, pan0=0.0, pan1=0.0, peak=0.6):
    tt = tt_(d); n = len(tt); x = noise(d)
    # time-varying band via short-block filtering
    out = np.zeros(n); blk = 1024
    zi = None
    for b0 in range(0, n, blk):
        p = b0 / n; fc = f1 * (f2 / f1) ** p
        bb, aa = signal.butter(2, [max(40, fc * 0.6) / (SR / 2), min(20000, fc * 1.6) / (SR / 2)], 'band')
        if zi is None: zi = signal.lfilter_zi(bb, aa) * 0
        out[b0:b0 + blk], zi = signal.lfilter(bb, aa, x[b0:b0 + blk], zi=zi)
    e = np.where(tt < d * peak, (tt / (d * peak)) ** 2, ((d - tt) / (d * (1 - peak))) ** 1.5)
    out *= e
    pans = np.linspace(pan0, pan1, n); a = (pans + 1) * np.pi / 4
    st = np.stack([out * np.cos(a), out * np.sin(a)], 1) * np.sqrt(2)
    add(sfx, verb(st, IR_ROOM, 0.3), t0, gain)

def shimmer(t0, d, gain, lo=5000, hi=11000, rate=1.03, density=40, seed=0):
    r = np.random.default_rng(seed)
    tt = tt_(d); n = len(tt)
    air = hp(noise(d), lo) * 0.25
    trem = 0.55 + 0.45 * np.sin(2 * np.pi * rate * tt) ** 2
    st = np.stack([air * trem, np.roll(air, 77) * trem], 1)
    # glints
    for _ in range(int(density * d)):
        tg = r.uniform(0, d - 0.3); f = r.uniform(lo * 0.6, hi * 0.8); gd = 0.25; gt = tt_(gd)
        g = np.sin(2 * np.pi * f * gt) * np.exp(-gt / 0.05) * np.minimum(1, gt / 0.004) * r.uniform(.2, .6)
        pan = r.uniform(-.8, .8); a = (pan + 1) * np.pi / 4
        i0 = int(tg * SR); st[i0:i0 + len(g), 0] += g * np.cos(a); st[i0:i0 + len(g), 1] += g * np.sin(a)
    e = adsr(n, d * 0.25, d * 0.35, 1.5)
    add(sfx, verb(st * e[:, None], IR_HALL, 0.5), t0, gain)

def tone_swell(t0, d, gain, freqs, bright=1500, peak=0.6):
    tt = tt_(d); x = np.zeros_like(tt)
    for i, f in enumerate(freqs):
        x += np.sin(2 * np.pi * f * tt + i) * (1 + 0.3 * np.sin(2 * np.pi * (0.3 + 0.1 * i) * tt))
        x += 0.25 * np.sin(4 * np.pi * f * tt + i)
    x = lp(np.tanh(x * 0.6), bright)
    e = np.where(tt < d * peak, np.sin(np.pi / 2 * tt / (d * peak)) ** 2, np.cos(np.pi / 2 * (tt - d * peak) / (d * (1 - peak))) ** 2)
    add(sfx, verb(x * e, IR_HALL, 0.4), t0, gain)

def hum(t0, d, gain, f=60.0, ramp=0.4, pan=0.0, rough=0.0):
    tt = tt_(d)
    x = sum(np.sin(2 * np.pi * f * k * tt) / k ** 1.3 for k in range(1, 9))
    if rough: x = x * (1 + rough * lp(noise(d), 40))
    x = lp(x, 900)
    e = adsr(len(tt), ramp, min(0.5, d * 0.3), 1.5)
    add(sfx, x * e, t0, gain, pan)

# hook
impact(0.0, 0.42)
whoosh(0.05, 1.5, 0.10, 200, 2500, -0.2, 0.2, 0.7)                 # push-in air
bell(0.42, 1567.98, 0.035, 0.15, 1.4)                               # glass accent with headline
bell(0.7, 2349.3, 0.018, -0.25, 1.2)
whoosh(T["fire"] - 0.25, 0.9, 0.08, 150, 900, 0, 0, 0.35)           # flame bloom
shimmer(T["fire"] + 0.4, 0.9, 0.05, 4000, 9000, 2, 25, 1)           # flame dissolves into data
whoosh(2.3, 0.6, 0.13, 400, 5000, 0.0, 0.0, 0.55)                  # into the chamber
# scan tone
d = 1.15; tt = tt_(d); sc = np.sin(2 * np.pi * (1320 + 30 * np.sin(2 * np.pi * 7 * tt)) * tt) * adsr(len(tt), 0.15, 0.3)
add(sfx, verb(lp(sc, 5000), IR_ROOM, 0.4), T["radio"] - 0.02, 0.012, 0.0)
# waves
whoosh(T["uses"] - 0.3, 0.6, 0.07, 800, 6000, 0.6, -0.2, 0.5)
shimmer(T["uses"] - 0.1, 3.4, 0.09, 4500, 12000, 1.03, 30, 2)
# cutaway
whoosh(8.0, 0.55, 0.08, 300, 3500, -0.3, 0.3)
# magnetron activation: soft power-up then hum
d = 1.2; tt = tt_(d)
f = 70 + 90 * (tt / d) ** 0.6
pu = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(4 * np.pi * np.cumsum(f) / SR)
pu = lp_sweep(pu, 600, 3100) * adsr(len(tt), 0.5, 0.4)
add(sfx, verb(pu, IR_ROOM, 0.3), T["magnetron"] - 0.15, 0.09, 0.35)
hum(T["magnetron"] + 0.4, 14.3 - T["magnetron"], 0.03, 60, 0.6, 0.3, 0.05)
# pulse along waveguide (right -> left)
tp = T["generates"] - 0.15
d = 1.25; tt = tt_(d); zf = 900 + 500 * np.sin(np.pi * tt / d)
z = np.sin(2 * np.pi * np.cumsum(zf) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 14 * tt)) * adsr(len(tt), 0.15, 0.5)
pans = np.linspace(0.7, -0.4, len(tt)); a = (pans + 1) * np.pi / 4
add(sfx, verb(np.stack([z * np.cos(a), z * np.sin(a)], 1), IR_ROOM, 0.35), tp, 0.03)
whoosh(tp, 1.3, 0.05, 1500, 5000, 0.7, -0.4, 0.6)
# reflections: resonant metallic pings
bell(tp + 1.55, 523.25, 0.045, -0.4, 1.8, (1, 2.32, 4.25, 6.63, 8.9), 0.55)
bell(T["reflect"], 659.25, 0.055, 0.35, 2.2, (1, 2.32, 4.25, 6.63, 8.9), 0.6)
bell(T["reflect"] + 0.55, 783.99, 0.03, -0.2, 1.8, (1, 2.32, 4.25, 6.63, 8.9), 0.6)
# dive into the food -> molecular world
whoosh(14.2, 2.3, 0.10, 2500, 250, 0, 0, 0.8)
impact(16.15, 0.08)
shimmer(16.2, 5.2, 0.075, 6000, 13000, 0.55 * 2, 45, 4)
# field reversal ticks (each zero crossing of the illustrative field)
for kk in range(12):
    tz = 16.3 + (kk + 0.5) / (2 * 0.55)
    if tz > 21.0: break
    whoosh(tz - 0.12, 0.3, 0.025, 2000, 7000, -0.5 if kk % 2 else 0.5, 0.5 if kk % 2 else -0.5, 0.5)
# energy -> heat swell
tone_swell(T["transfers"], 3.3, 0.06, [146.83, 220.0, 293.66, 369.99], 1400, 0.55)
whoosh(21.75, 0.6, 0.06, 3000, 400, 0, 0, 0.4)
# the twist: reverse swell into a soft low accent + whip
d = 0.7; tt = tt_(d); rs = verb(bp(noise(d), 200, 3000), IR_HALL, 0.8)[:, 0] * (tt / d) ** 3
add(sfx, rs, T["but"] - 0.6, 0.10)
impact(T["but"] + 0.02, 0.15)
whoosh(24.12, 0.4, 0.12, 600, 6000, -0.6, 0.6, 0.5)
# energy absorbed (crest pulses) then heat spreads (warm tonal glide)
shimmer(T["mw2"], 3.4, 0.05, 3500, 9000, 7.0 / (2 * np.pi), 15, 6)
d = 3.8; tt = tt_(d); g = sum(np.sin(2 * np.pi * f0 * (1 + 0.06 * tt / d) * tt) for f0 in (196.0, 293.66, 392.0))
g = lp_sweep(g, 800, 1700) * adsr(len(tt), 1.4, 1.4)
add(sfx, verb(g, IR_HALL, 0.45), T["they"] + 0.05, 0.035)
# payoff dissolve
whoosh(33.15, 0.5, 0.06, 500, 4000)
# turntable motor + rollers
tr0 = T["cold"] - 0.55
hum(tr0, 38.55 - tr0, 0.03, 50, 0.7, -0.1, 0.25)
d = 38.55 - tr0; tt = tt_(d); rl = lp(noise(d), 380) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.6 * tt)) * adsr(len(tt), 0.8, 0.6)
add(sfx, rl, tr0, 0.03, 0.1)
# hero: bowl slides out and is set down
d = 1.0; tt = tt_(d); scrape = bp(noise(d), 900, 4000) * adsr(len(tt), 0.2, 0.4) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * tt))
add(sfx, verb(scrape, IR_ROOM, 0.3), 38.2, 0.012)
bell(39.25, 1046.5, 0.012, 0.0, 0.5, (1, 2.71, 5.2), 0.3)
# final resolution chime
bell(T["matters"] - 0.3, 1174.66, 0.03, -0.2, 1.5)
bell(T["matters"] - 0.12, 1479.98, 0.02, 0.25, 1.4)

# fade any tails so nothing is cut abruptly at 40.0 s
fade_tail = np.clip((DUR - t_all) / 0.6, 0, 1) ** 1.5
sfx *= fade_tail[:, None]; music *= fade_tail[:, None]

# ---------------------------------------------------------------- voice chain
v24, vsr = sf.read(B / "voice_raw.wav")
v = signal.resample_poly(v24, 2, 1) if vsr == 24000 else v24
v = hp(v, 75, 2)
v = peaking(v, 220, -1.5, 0.9)
v = peaking(v, 3400, 2.0, 1.0)
v = peaking(v, 7200, -1.5, 2.0)        # gentle de-harsh
# RMS compressor
env = np.sqrt(np.maximum(uniform_filter1d(v ** 2, int(0.01 * SR)), 0) + 1e-12)
lvl = 20 * np.log10(env)
thr, ratio = -24.0, 2.6
gr = np.where(lvl > thr, (thr - lvl) * (1 - 1 / ratio), 0.0)
# attack/release smoothing of gain reduction
a_att, a_rel = np.exp(-1 / (0.006 * SR)), np.exp(-1 / (0.12 * SR))
g = np.zeros_like(gr); cur = 0.0
for i in range(len(gr)):
    x = gr[i]; cur = a_att * cur + (1 - a_att) * x if x < cur else a_rel * cur + (1 - a_rel) * x; g[i] = cur
v = v * 10 ** (g / 20)
voice = np.zeros(N); voice[:min(N, len(v))] = v[:N]
voice = voice / (np.abs(voice).max() + 1e-9) * 0.5
voice_st = np.stack([voice, voice], 1)
# a touch of room so it sits in the mix (not widened)
voice_st = 0.94 * voice_st + 0.06 * verb(voice, IR_ROOM, 1.0)

# ---------------------------------------------------------------- ducking + mix
venv = np.sqrt(np.maximum(uniform_filter1d(voice ** 2, int(0.05 * SR)), 0))
venv = venv / (np.percentile(venv[venv > 1e-4], 90) + 1e-9)
duck = np.clip(venv, 0, 1)
a_rel = np.exp(-1 / (0.35 * SR)); a_att = np.exp(-1 / (0.04 * SR))
sm = np.zeros_like(duck); cur = 0.0
for i in range(N):
    x = duck[i]; cur = a_att * cur + (1 - a_att) * x if x > cur else a_rel * cur + (1 - a_rel) * x; sm[i] = cur
music_g = db(-7.0 * sm)
sfx_g = db(-2.5 * sm)

def lufs(x):
    sf.write(B / "_tmp.wav", x, SR, subtype="FLOAT")
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(B / "_tmp.wav"), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    summ = out[out.rfind("Summary:"):]
    if "Peak:" not in summ or not re.search(r"I:\s+-?[\d.]", summ): print("EBUR FAIL", np.isnan(x).sum(), np.abs(x).max(), summ[-600:])
    I = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summ).group(1)); tp = float(re.search(r"Peak:\s+(-?[\d.]+|-inf)", summ).group(1))
    return I, tp

# stem levels relative to the voice
vI, _ = lufs(voice_st)
mI, _ = lufs(music); sI, _ = lufs(sfx)
voice_st *= db(-16 - vI)
music *= db(-27.5 - mI)
sfx *= db(-26.5 - sI)
mix = voice_st + music * music_g[:, None] + sfx * sfx_g[:, None]

def limiter(x, ceil_db=-1.5, look=0.005, rel=0.08):
    c = db(ceil_db)
    peak = np.abs(x).max(1)
    g = np.minimum(1.0, c / np.maximum(peak, 1e-9))
    w = int(look * SR)
    g = minimum_filter1d(g, 2 * w + 1)
    g = uniform_filter1d(g, w)
    # release smoothing (only lets gain rise slowly)
    a = np.exp(-1 / (rel * SR)); out = np.empty_like(g); cur = 1.0
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else a * cur + (1 - a) * g[i]; out[i] = cur
    y = x * out[:, None]
    return np.clip(y, -c, c)

I0, _ = lufs(mix)
mix *= db(-14.0 - I0)
pre = mix.copy()
mix = limiter(mix, -1.5)
grd = 20 * np.log10(np.maximum(np.abs(mix).max(1), 1e-9) / np.maximum(np.abs(pre).max(1), 1e-9))
print(f"limiter: max GR {grd.min():.2f} dB, samples >1 dB GR: {(grd < -1).mean() * 100:.2f}%")
I1, tp1 = lufs(mix)
mix *= db(-14.0 - I1); mix = limiter(mix, -1.5)
I2, tp2 = lufs(mix)
print(f"voice/music/sfx stems placed; final integrated {I2:.2f} LUFS, true peak {tp2:.2f} dBFS, sample peak {20*np.log10(np.abs(mix).max()):.2f} dBFS")

sf.write(B / "mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")
sf.write(B / "stems/voice.wav", voice_st.astype(np.float32), SR, subtype="FLOAT")
sf.write(B / "stems/music.wav", (music * music_g[:, None]).astype(np.float32), SR, subtype="FLOAT")
sf.write(B / "stems/sfx.wav", (sfx * sfx_g[:, None]).astype(np.float32), SR, subtype="FLOAT")
(B / "_tmp.wav").unlink(missing_ok=True)
