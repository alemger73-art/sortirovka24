"""Original background music for «Шақыру» invitations — synthesised here, so there are no rights to anyone else's song.
Four tracks: dombra (Kazakh plucked tune over a drone), waltz (piano + strings), tender (music box lullaby), festive (pop-ish).
"""
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
rng = np.random.default_rng(7)


def hz(note: str) -> float:
    m = re.match(r'^([A-G])([#b]?)(\d)$', note)
    base = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[m.group(1)]
    base += {'#': 1, 'b': -1, '': 0}[m.group(2)]
    midi = 12 * (int(m.group(3)) + 1) + base
    return 440.0 * 2 ** ((midi - 69) / 12)


def parse(seq: str):
    """'A4:0.5 r:1 C5:1' → [(note|None, beats)]"""
    out = []
    for tok in seq.split():
        n, b = tok.split(':')
        out.append((None if n == 'r' else n, float(b)))
    return out


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def env(n, a=0.005, r=0.05):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


# ---------------- instruments ----------------
def pluck(f, dur, bright=0.5, decay=0.996, tone=3200):
    """Karplus-Strong string — dombra/plucked."""
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = (rng.random(p) * 2 - 1)
    buf = lp(buf, 2000 + 6000 * bright, 1)
    out = np.zeros(n)
    b = buf.copy()
    idx = 0
    prev = 0.0
    for i in range(n):
        v = b[idx]
        nv = decay * 0.5 * (v + prev)
        prev = v
        b[idx] = nv
        out[i] = v
        idx = (idx + 1) % p
    body = lp(out, tone, 2) + 0.35 * sosfilt(butter(2, [180, 260], 'band', fs=SR, output='sos'), out)
    return body * env(n, 0.002, 0.08)


def piano(f, dur, vel=0.7):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    B = 0.0003
    for k in range(1, 9):
        fk = k * f * np.sqrt(1 + B * k * k)
        if fk > 12000:
            break
        amp = vel / k ** 1.25
        dec = 1.1 + 0.9 * k + f / 400
        out += amp * np.sin(2 * np.pi * fk * t) * np.exp(-dec * t)
    # damper after key release
    rel = int(dur * SR)
    if rel < n:
        out[rel:] *= np.exp(-np.arange(n - rel) / (0.25 * SR))
    hammer = lp(rng.standard_normal(int(0.012 * SR)), 2500) * 0.04 * vel
    out[:len(hammer)] += hammer
    return out * env(n, 0.003, 0.05)


def bell(f, dur, vel=0.6):
    """Music box / celesta: FM with a decaying index."""
    n = int((dur + 1.5) * SR)
    t = np.arange(n) / SR
    idx = 2.2 * np.exp(-6 * t)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t))
    s += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-5 * t)
    return vel * s * np.exp(-2.4 * t) * env(n, 0.002, 0.1)


def pad(freqs, dur, vel=0.18, bright=1800):
    n = int((dur + 0.8) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            vib = 0.0025 * np.sin(2 * np.pi * 5.1 * t + rng.random() * 6)
            ph = 2 * np.pi * ff * t * (1 + vib)
            out += np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.18 * np.sin(3 * ph)
    out = lp(out, bright)
    a, r = 0.6, 0.8
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2
    e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return vel * out / (len(freqs) * 3) * e


def thump(vel=0.8):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 55 + 70 * np.exp(-25 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9 * t)
    s += lp(rng.standard_normal(n), 900) * np.exp(-60 * t) * 0.3
    return vel * s


def shaker(vel=0.12):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return vel * hp(rng.standard_normal(n), 6000) * np.exp(-45 * t)


def clap(vel=0.25):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    s = sosfilt(butter(2, [900, 2600], 'band', fs=SR, output='sos'), rng.standard_normal(n))
    e = np.exp(-22 * t) + 0.6 * np.exp(-60 * np.maximum(0, t - 0.012)) * (t > 0.012)
    return vel * s * e


# ---------------- mixing ----------------
class Mix:
    def __init__(self, seconds):
        self.L = np.zeros(int(seconds * SR) + SR * 4)
        self.R = np.zeros_like(self.L)

    def add(self, sig, at, gain=1.0, pan=0.0):
        i = int(at * SR)
        j = min(len(self.L), i + len(sig))
        s = sig[: j - i] * gain
        self.L[i:j] += s * np.sqrt(0.5 * (1 - pan))
        self.R[i:j] += s * np.sqrt(0.5 * (1 + pan))

    def render(self, seconds, wet=0.22, fade_in=1.2, fade_out=3.5):
        n = int(seconds * SR)
        out = []
        ir_n = int(2.6 * SR)
        t = np.arange(ir_n) / SR
        for ch, seed in ((self.L, 1), (self.R, 2)):
            g = np.random.default_rng(seed)
            ir = lp(g.standard_normal(ir_n), 5000) * np.exp(-t / 0.55)
            ir[: int(0.012 * SR)] = 0
            ir /= np.sqrt(np.sum(ir ** 2))
            dry = ch[:n + ir_n]
            w = fftconvolve(dry, ir)[: n]
            out.append(dry[:n] * (1 - wet) + w * wet * 0.9)
        st = np.stack(out, 1)
        st = hp(st.T, 35).T
        e = np.ones(n)
        e[: int(fade_in * SR)] = np.linspace(0, 1, int(fade_in * SR))
        e[-int(fade_out * SR):] = np.linspace(1, 0, int(fade_out * SR)) ** 1.6
        st *= e[:, None]
        # gentle glue compression + normalise to about -16 LUFS-ish RMS, peak ≤ -1 dBFS
        rms = np.sqrt(np.mean(st ** 2))
        st *= 0.085 / max(rms, 1e-9)
        st = np.tanh(st * 1.1) / np.tanh(1.1)
        peak = np.max(np.abs(st))
        if peak > 0.89:
            st *= 0.89 / peak
        return st


def write(name, st):
    wav = OUT / f'{name}.wav'
    pcm = (st * 32767).astype(np.int16)
    import wave
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = OUT / f'{name}.mp3'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '112k', '-ac', '2',
                    '-metadata', 'title=' + name, '-metadata', 'artist=Сортировка 24', str(mp3)], check=True)
    wav.unlink()
    print(name, f'{len(st) / SR:.1f}s', f'{mp3.stat().st_size // 1024} KB')


def melody(mix, seq, start, beat, inst, gain=1.0, pan=0.0, octave=0, **kw):
    t = start
    for note, b in parse(seq):
        if note:
            f = hz(note) * 2 ** octave
            mix.add(inst(f, b * beat, **kw), t, gain, pan)
        t += b * beat
    return t


# ---------------- 1. Dombra ----------------
def dombra():
    beat = 60 / 112
    A = ('A4:0.5 A4:0.25 G4:0.25 A4:0.5 C5:0.5  D5:0.75 C5:0.25 A4:1  G4:0.5 A4:0.25 G4:0.25 F4:0.5 E4:0.5  D4:1.5 r:0.5 '
         'F4:0.5 G4:0.5 A4:0.5 C5:0.5  D5:0.5 E5:0.25 D5:0.25 C5:0.5 A4:0.5  G4:0.5 F4:0.25 E4:0.25 F4:0.5 E4:0.5  D4:2')
    B = ('D5:0.5 D5:0.25 E5:0.25 F5:0.5 E5:0.5  D5:0.75 C5:0.25 A4:1  C5:0.5 C5:0.25 D5:0.25 C5:0.5 A4:0.5  G4:1.5 r:0.5 '
         'A4:0.5 C5:0.5 D5:0.5 E5:0.5  F5:0.5 E5:0.25 D5:0.25 C5:0.5 A4:0.5  G4:0.5 A4:0.25 G4:0.25 F4:0.5 E4:0.5  D4:2')
    harm = 'DDGDDDGD' + 'DDGGDDGD'
    bars = 48
    total = bars * 2 * beat + 4
    mix = Mix(total)
    t = 0.0
    for rep in range(3):
        start = t
        t = melody(mix, A + ' ' + B, t, beat, pluck, gain=1.0, pan=0.15, bright=0.45, decay=0.997, tone=4200)
        if rep == 2:  # last time a second dombra answers an octave lower
            melody(mix, A + ' ' + B, start, beat, pluck, gain=0.45, pan=-0.35, octave=-1, bright=0.5)
    # two-string strum: down (both), up (top), down (both)
    for bar in range(bars):
        h = harm[bar % 16]
        top = hz('A3') if h == 'D' else hz('G3')
        low = hz('D3')
        for bt in range(2):
            t0 = (bar * 2 + bt) * beat
            for off, both, g in ((0.0, True, 0.32), (0.5, False, 0.14), (0.75, True, 0.2)):
                at = t0 + off * beat + 0.012
                mix.add(pluck(top, beat * 0.6, bright=0.1, decay=0.992, tone=1600), at, g, -0.25)
                if both:
                    mix.add(pluck(low, beat * 0.6, bright=0.08, decay=0.992, tone=1400), at + 0.008, g * 0.9, -0.3)
        if bar >= 8:  # frame drum gallop from the second phrase
            mix.add(thump(0.45), bar * 2 * beat, 1.0)
            mix.add(thump(0.25), (bar * 2 + 1.5) * beat, 1.0)
    return mix.render(bars * 2 * beat + 3, wet=0.18)


# ---------------- 2. Wedding waltz ----------------
CH = {'G': ['G2', 'B3', 'D4', 'G4'], 'Em': ['E2', 'G3', 'B3', 'E4'], 'C': ['C3', 'E3', 'G3', 'C4'], 'D': ['D2', 'F#3', 'A3', 'D4'],
      'Am': ['A2', 'C4', 'E4', 'A4'], 'A': ['A2', 'C#4', 'E4', 'A4'], 'Bm': ['B2', 'D4', 'F#4', 'B4'], 'F': ['F2', 'A3', 'C4', 'F4'],
      'Dm': ['D3', 'F3', 'A3', 'D4']}


def waltz():
    beat = 60 / 88
    mel = ('B4:1 D5:1 G5:1  F#5:2 E5:1  E5:1 G5:1 B5:1  A5:2 G5:1  G5:1 E5:1 C5:1  D5:2 E5:1  F#5:1.5 E5:0.5 D5:1  A4:3 '
           'B4:1 D5:1 G5:1  F#5:2 E5:1  E5:1 G5:1 B5:1  D6:2 B5:1  C6:1 B5:1 A5:1  G5:1 F#5:1 E5:1  D5:1.5 E5:0.5 F#5:1  G5:3')
    chords = ['G', 'G', 'Em', 'Em', 'C', 'C', 'D', 'D', 'G', 'G', 'Em', 'Em', 'Am', 'D', 'G', 'G']
    bars = 32
    mix = Mix(bars * 3 * beat + 4)
    melody(mix, mel, 0, beat, piano, gain=0.55, pan=0.1, vel=0.75)
    melody(mix, mel, 16 * 3 * beat, beat, piano, gain=0.45, pan=0.1, vel=0.75)
    melody(mix, mel, 16 * 3 * beat, beat, bell, gain=0.08, pan=0.3, octave=0)
    for bar in range(bars):
        c = CH[chords[bar % 16]]
        t0 = bar * 3 * beat
        mix.add(piano(hz(c[0]), beat * 1.6, vel=0.6), t0, 0.5, -0.2)
        for k in (1, 2):
            for nn in c[1:]:
                mix.add(piano(hz(nn), beat * 0.7, vel=0.35), t0 + k * beat, 0.32, -0.1)
        if bar % 2 == 0:
            mix.add(pad([hz(n) for n in c[1:]], beat * 6, vel=0.5 if bar >= 16 else 0.3), t0, 1.0, 0.0)
    return mix.render(bars * 3 * beat + 3, wet=0.28)


# ---------------- 3. Tender (music box) ----------------
def tender():
    beat = 60 / 72
    mel = ('E5:1 G5:1 E5:1 C5:1  A4:1 C5:1 E5:2  F5:1 E5:1 D5:1 C5:1  D5:3 r:1 '
           'E5:1 G5:1 C6:1 B5:1  A5:2 E5:2  F5:1 E5:1 D5:1 B4:1  C5:4')
    chords = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'C']
    bars = 16
    mix = Mix(bars * 4 * beat + 4)
    melody(mix, mel, 0, beat, bell, gain=0.42, pan=0.15)
    melody(mix, mel, 8 * 4 * beat, beat, bell, gain=0.36, pan=0.15, octave=1)
    melody(mix, mel, 8 * 4 * beat, beat, piano, gain=0.3, pan=-0.1, vel=0.5)
    for bar in range(bars):
        name = chords[bar % 8]
        if bar % 8 == 6:
            name = 'Dm'
        c = CH[name] if name != 'C' else ['C3', 'E4', 'G4', 'C5']
        t0 = bar * 4 * beat
        arp = [c[0], c[1], c[2], c[3], c[2], c[1], c[2], c[3]]
        for i, nn in enumerate(arp):
            f = hz(nn) * (2 if i else 1)
            mix.add(bell(f, beat * 0.5, vel=0.25), t0 + i * beat * 0.5, 0.35, -0.25 + 0.06 * i)
        if bar % 8 == 6:  # G on the second half of bar 7
            pass
        mix.add(pad([hz(n) for n in c[1:]], beat * 4, vel=0.35, bright=1400), t0, 1.0, 0.0)
    return mix.render(bars * 4 * beat + 3, wet=0.32)


# ---------------- 4. Festive ----------------
def festive():
    beat = 60 / 118
    mel = ('F#5:1 A5:1 F#5:0.5 E5:0.5 D5:1  E5:1 C#5:1 A4:2  D5:1 F#5:1 B5:1 A5:0.5 F#5:0.5  G5:2 F#5:1 E5:1 '
           'F#5:1 A5:1 D6:1 C#6:0.5 B5:0.5  A5:1 E5:1 C#5:2  D5:1 F#5:1 E5:1 G5:1  F#5:2 D5:2')
    chords = [['D'], ['A'], ['Bm'], ['G'], ['D'], ['A'], ['Bm', 'G'], ['A', 'D']]
    bars = 32
    mix = Mix(bars * 4 * beat + 4)
    for rep in range(4):
        start = rep * 8 * 4 * beat
        melody(mix, mel, start, beat, pluck, gain=0.75, pan=0.15, bright=0.8, decay=0.997)
        if rep >= 1:
            melody(mix, mel, start, beat, bell, gain=0.12, pan=0.35, octave=0)
        if rep >= 2:
            melody(mix, mel, start, beat, piano, gain=0.28, pan=-0.15, vel=0.6, octave=-1)
    for bar in range(bars):
        t0 = bar * 4 * beat
        parts = chords[bar % 8]
        for half, name in enumerate(parts if len(parts) == 2 else parts * 2):
            c = CH[name]
            th = t0 + half * 2 * beat
            mix.add(piano(hz(c[0]), beat * 1.8, vel=0.65), th, 0.45, -0.2)
            for k in (0.5, 1.5):  # offbeat chord stabs
                for nn in c[1:]:
                    mix.add(piano(hz(nn), beat * 0.35, vel=0.4), th + k * beat, 0.26, -0.05)
        if bar >= 4:
            for b in range(4):
                if b % 2 == 0:
                    mix.add(thump(0.6), t0 + b * beat, 1.0)
                else:
                    mix.add(clap(0.22), t0 + b * beat, 1.0, 0.1)
            for e in range(8):
                mix.add(shaker(0.09 if e % 2 else 0.05), t0 + e * beat / 2, 1.0, 0.4)
        if bar >= 16 and bar % 2 == 0:
            mix.add(pad([hz(n) for n in CH[parts[0]][1:]], beat * 8, vel=0.35), t0, 1.0)
    return mix.render(bars * 4 * beat + 3, wet=0.2)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    which = sys.argv[2:] or ['dombra', 'waltz', 'tender', 'festive']
    for name in which:
        write(name, globals()[name]())
