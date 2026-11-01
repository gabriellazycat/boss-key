#!/usr/bin/env python3
"""Procedural sound effects for the Boss Key office-stealth comedy.

Writes 48 mono, 16-bit, 44.1 kHz WAV files into ../assets/sfx/ (relative to
this script). Standard library + numpy only.

Reproducible: every file draws from its own RNG seeded by crc32 of its name,
so the output does not depend on generation order.

Levels: every file is peak-normalised to -1 dBFS unless SOUNDS gives another
level (office_ambience -12 dBFS, menu_music -6 dBFS). Non-loop files get a 5 ms
fade in and out. Loops get no boundary fade (it would leave a dip at the seam).

Loops are seamless by construction:
  * "crossfade" loops (elevator_move, printer_jam, office_ambience): the
    generator renders 0.5 s past the loop end and loop_seam() blends that tail
    into the head with an equal-power crossfade.
  * "wrap" loops (radio_music, menu_music, fish_reel, heartbeat): every event
    is written modulo the loop length, so the buffer is periodic.
"""

import os
import wave
import zlib

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "assets", "sfx"))
XFADE_S = 0.5


# ----------------------------------------------------------------- basics

def n_of(dur):
    return int(round(dur * SR))


def tt(dur):
    return np.arange(n_of(dur)) / SR


def phase(freq, n):
    """Running phase in radians for a scalar or per-sample frequency."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return 2.0 * np.pi * np.cumsum(f) / SR


def osc(freq, n, kind="sine"):
    p = phase(freq, n)
    if kind == "sine":
        return np.sin(p)
    if kind == "tri":
        return (2.0 / np.pi) * np.arcsin(np.sin(p))
    if kind == "square":  # tanh-softened square: friendlier than a hard edge
        return np.tanh(2.5 * np.sin(p)) / np.tanh(2.5)
    if kind == "saw":
        return 2.0 * ((p / (2.0 * np.pi)) % 1.0) - 1.0
    raise ValueError(kind)


def env_pts(n, pts):
    """Piecewise-linear envelope through (seconds, level) points, zero outside."""
    t = np.arange(n) / SR
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return np.interp(t, xs, ys, left=0.0, right=0.0)


def decay(n, tau, attack=0.002):
    t = np.arange(n) / SR
    return np.minimum(t / attack, 1.0) * np.exp(-t / tau)


def adsr(n, a, d, s, r):
    dur = n / SR
    sus_end = max(dur - min(r, dur * 0.5), a + d)
    return env_pts(n, [(0.0, 0.0), (a, 1.0), (a + d, s), (sus_end, s), (dur, 0.0)])


def lp1(x, fc):
    """One-pole low-pass. fc: scalar, or per-sample array for sweeps."""
    x = np.asarray(x, dtype=float)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = (1.0 - np.exp(-2.0 * np.pi * np.clip(fc, 5.0, 0.45 * SR) / SR)).tolist()
    out = []
    s = 0.0
    for xi, ai in zip(x.tolist(), a):
        s += ai * (xi - s)
        out.append(s)
    return np.array(out)


def hp1(x, fc):
    """One-pole high-pass (input minus its low-pass)."""
    x = np.asarray(x, dtype=float)
    return x - lp1(x, fc)


def bp(x, lo, hi):
    return hp1(lp1(x, hi), lo)


def reson(x, fc, bw):
    """Two-pole resonator, used as a formant for the gibberish voices."""
    r = np.exp(-np.pi * bw / SR)
    c1 = 2.0 * r * np.cos(2.0 * np.pi * fc / SR)
    c2 = -r * r
    g = 1.0 - r
    y1 = y2 = 0.0
    out = []
    for xi in np.asarray(x, dtype=float).tolist():
        y = g * xi + c1 * y1 + c2 * y2
        out.append(y)
        y2, y1 = y1, y
    return np.array(out)


def white(rng, n):
    return rng.uniform(-1.0, 1.0, n)


def brown(rng, n):
    b = hp1(np.cumsum(white(rng, n)), 12.0)
    return b / (np.max(np.abs(b)) + 1e-12)


def place(buf, sig, t0, wrap=False):
    """Add sig into buf at t0 seconds. wrap=True treats buf as a loop."""
    i0 = int(round(t0 * SR))
    if wrap:
        idx = (i0 + np.arange(len(sig))) % len(buf)
        np.add.at(buf, idx, sig)
        return buf
    if i0 >= len(buf):
        return buf
    i1 = min(len(buf), i0 + len(sig))
    buf[i0:i1] += sig[: i1 - i0]
    return buf


def loop_seam(y, n_loop, equal_power=True):
    """y holds n_loop + XFADE samples. Blend the tail into the head so the
    loop end flows into its start without a level dip or a click."""
    x = n_of(XFADE_S)
    head = y[:n_loop].copy()
    tail = y[n_loop:n_loop + x]
    u = np.linspace(0.0, 1.0, x)
    if equal_power:
        w_head, w_tail = np.sin(u * np.pi / 2), np.cos(u * np.pi / 2)
    else:
        w_head, w_tail = u, 1.0 - u
    head[:x] = head[:x] * w_head + tail * w_tail
    return head


# ----------------------------------------------------------- voices & parts

BELL_RATIOS = (1.0, 2.756, 5.404, 8.933)  # inharmonic bell partials
BELL_AMPS = (1.0, 0.45, 0.2, 0.08)
BELL_DECAY = (1.0, 0.5, 0.3, 0.15)

NOTE_PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
           "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10,
           "Bb": 10, "B": 11}


def note_hz(name):
    """'A4' -> 440.0 Hz."""
    midi = 12 * (int(name[-1]) + 1) + NOTE_PC[name[:-1]]
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def bell(freq, dur, tau, amp=1.0, ratios=BELL_RATIOS):
    n = n_of(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for r, a, k in zip(ratios, BELL_AMPS, BELL_DECAY):
        if freq * r < 0.45 * SR:
            out += a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / (tau * k))
    return amp * out * np.minimum(t / 0.003, 1.0)


def tri_note(freq, dur, tau, amp=1.0):
    n = n_of(dur)
    return amp * osc(freq, n, "tri") * decay(n, tau, attack=0.005)


def pop(freq, dur, tau, fc=3500.0, amp=1.0):
    """Soft square blip with a fast exponential decay."""
    n = n_of(dur)
    return amp * lp1(osc(freq, n, "square"), fc) * decay(n, tau, attack=0.002)


def lead(freq, dur, amp=1.0, vib=0.0, harmony=0.0, fc=2600.0):
    """Triangle + soft square lead with ADSR; optional vibrato and a harmony voice."""
    n = n_of(dur)
    t = np.arange(n) / SR
    f = freq * (1.0 + vib * np.sin(2 * np.pi * 5.5 * t))
    src = 0.6 * osc(f, n, "tri") + 0.3 * osc(f, n, "square")
    if harmony:
        src = src + 0.35 * osc(f * harmony, n, "tri")
    y = lp1(src, fc)
    return amp * y * adsr(n, 0.006, 0.04, 0.7, min(0.08, dur * 0.3))


def flute(freq, dur, amp=0.25):
    n = n_of(dur)
    t = np.arange(n) / SR
    f = freq * (1.0 + 0.004 * np.sin(2 * np.pi * 5.0 * t) * np.clip(t / 0.2, 0.0, 1.0))
    s = np.sin(phase(f, n)) + 0.2 * np.sin(phase(2.0 * f, n))
    return amp * s * adsr(n, 0.03, 0.12, 0.7, min(0.15, dur * 0.3))


def ep_tone(freq, dur, tau=0.5, amp=1.0):
    """Electric-piano-ish tone: sine body plus fast-fading 2nd and 3rd partials."""
    n = n_of(dur)
    t = np.arange(n) / SR
    body = (np.sin(2 * np.pi * freq * t)
            + 0.35 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t / (tau * 0.4))
            + 0.08 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t / (tau * 0.2)))
    return amp * body * np.minimum(t / 0.004, 1.0) * np.exp(-t / tau)


def bass_note(freq, dur, tau=0.3, amp=1.0):
    n = n_of(dur)
    return amp * osc(freq, n, "tri") * decay(n, tau, attack=0.004)


def kick(amp=0.9):
    n = n_of(0.2)
    t = np.arange(n) / SR
    body = np.sin(phase(45.0 + 75.0 * np.exp(-t / 0.03), n))
    return amp * body * np.exp(-t / 0.12) * np.minimum(t / 0.002, 1.0)


def noise_tick(rng, amp, fc=6500.0, tau=0.02, dur=0.05):
    n = n_of(dur)
    t = np.arange(n) / SR
    return amp * hp1(white(rng, n), fc) * np.exp(-t / tau)


def latch(rng, amp=1.0):
    n = n_of(0.03)
    t = np.arange(n) / SR
    click = hp1(white(rng, n), 1800.0) * np.exp(-t / 0.003)
    tick = np.sin(2 * np.pi * 1900.0 * t) * np.exp(-t / 0.004)
    return amp * (0.8 * click + 0.6 * tick)


def thud(rng, f0, drop, tau, dur=0.25, noise_fc=450.0, noise_amp=0.35, amp=1.0):
    """Low sine with a quick pitch drop, plus a short filtered-noise crack."""
    n = n_of(dur)
    t = np.arange(n) / SR
    body = np.sin(phase(f0 + drop * np.exp(-t / 0.02), n)) * np.exp(-t / tau)
    crack = lp1(white(rng, n), noise_fc) * np.exp(-t / 0.02)
    return amp * (np.minimum(t / 0.002, 1.0) * body + noise_amp * crack)


def swish(rng, dur, f0, f1, env, width=1.3):
    """Band-passed noise whose centre sweeps exponentially from f0 to f1."""
    n = n_of(dur)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    band = hp1(lp1(white(rng, n), f * width), f / width)
    return band * env


def voice(f, n, formants):
    """Formant-filtered saw: a cheap cartoon voice with vowel-like resonances."""
    src = osc(f, n, "saw")
    out = np.zeros(n)
    for fc, bw, g in formants:
        out += g * reson(src, fc, bw)
    return out


# ------------------------------------------------------------- door and steps

def door_open(rng):
    dur = 0.9
    n = n_of(dur)
    t = np.arange(n) / SR
    jit = lp1(white(rng, n), 9.0)
    jit = jit / (np.max(np.abs(jit)) + 1e-12)
    f = (120.0 + 60.0 * (t / dur) ** 1.3) * (1.0 + 0.04 * jit)   # sweep with jitter
    creak = lp1(osc(f, n, "saw"), 700.0)
    wobble = 0.75 + 0.25 * np.sin(phase(8.0 + 3.0 * jit, n))
    env = env_pts(n, [(0.0, 0.0), (0.04, 1.0), (0.7, 0.9), (0.9, 0.0)])
    buf = 0.8 * creak * wobble * env
    return place(buf, latch(rng, 0.9), 0.0)


def door_close(rng):
    buf = np.zeros(n_of(0.5))
    place(buf, latch(rng, 0.9), 0.0)
    place(buf, thud(rng, 70.0, 25.0, 0.09, dur=0.3, noise_fc=450.0, noise_amp=0.5), 0.12)
    return buf


def boss_step(rng, base, tick_fc, tick_amp=0.5, thump_tau=0.06):
    n = n_of(0.18)
    t = np.arange(n) / SR
    f = base * (1.0 + 0.35 * np.exp(-t / 0.015))
    thump = np.sin(phase(f, n)) * np.exp(-t / thump_tau) * np.minimum(t / 0.002, 1.0)
    tick = hp1(lp1(white(rng, n), tick_fc), 300.0) * np.exp(-t / 0.012)
    return thump + tick_amp * tick


def boss_step_1(rng):
    return boss_step(rng, 78.0, 2400.0)


def boss_step_2(rng):
    return boss_step(rng, 70.0, 1700.0, thump_tau=0.07)


def boss_step_3(rng):
    return boss_step(rng, 86.0, 3000.0, tick_amp=0.45)


def step_soft(rng):
    # Quieter by character (less body, duller tick); the file itself is peak-normalised.
    n = n_of(0.12)
    t = np.arange(n) / SR
    body = 0.35 * np.sin(phase(105.0 + 15.0 * np.exp(-t / 0.01), n)) * np.exp(-t / 0.025)
    tick = hp1(lp1(white(rng, n), 4200.0), 1500.0) * np.exp(-t / 0.008) * 0.8
    return body * np.minimum(t / 0.002, 1.0) + tick


# ------------------------------------------------------ bells, typing, UI

def lamp_on(rng):
    buf = np.zeros(n_of(1.2))
    place(buf, bell(659.25, 0.7, tau=0.22), 0.0)          # E5
    place(buf, bell(523.25, 0.7, tau=0.25, amp=0.9), 0.5)  # C5
    return buf


def typing(rng):
    buf = np.zeros(n_of(0.6))
    t0 = 0.03
    for _ in range(6):
        n = n_of(0.03)
        t = np.arange(n) / SR
        fk = rng.uniform(1900.0, 2700.0)
        click = hp1(white(rng, n), 2500.0) * np.exp(-t / 0.0045)
        tick = np.sin(2 * np.pi * fk * t) * np.exp(-t / 0.003)
        place(buf, rng.uniform(0.6, 1.0) * (0.8 * click + 0.5 * tick), t0)
        t0 += rng.uniform(0.05, 0.10)
    return buf


def rhythm_hit(rng):
    return pop(880.0, 0.12, tau=0.03)


def rhythm_perfect(rng):
    buf = np.zeros(n_of(0.25))
    place(buf, pop(1046.5, 0.12, tau=0.035), 0.0)
    place(buf, pop(1568.0, 0.14, tau=0.04), 0.06)
    n = n_of(0.19)
    t = np.arange(n) / SR
    sparkle = (0.5 * np.sin(2 * np.pi * 2093 * t) + 0.35 * np.sin(2 * np.pi * 3136 * t)
               + 0.25 * np.sin(2 * np.pi * 4186 * t))
    place(buf, 0.35 * sparkle * np.exp(-t / 0.06) * np.minimum(t / 0.003, 1.0), 0.06)
    return buf


def rhythm_miss(rng):
    n = n_of(0.2)
    t = np.arange(n) / SR
    f = 180.0 - 60.0 * t / 0.2
    body = lp1(osc(f, n, "tri"), 700.0)
    return body * np.minimum(t / 0.004, 1.0) * np.exp(-t / 0.07)


def sort_ok(rng):
    buf = np.zeros(n_of(0.25))
    env = env_pts(n_of(0.2), [(0.0, 0.0), (0.03, 1.0), (0.12, 0.8), (0.2, 0.0)])
    place(buf, 0.9 * swish(rng, 0.2, 700.0, 3200.0, env), 0.0)
    n = n_of(0.04)
    t = np.arange(n) / SR
    place(buf, 0.5 * np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006), 0.2)
    return buf


def sort_bad(rng):
    n = n_of(0.3)
    t = np.arange(n) / SR
    buz = 0.5 * (osc(150.0, n, "square") + osc(156.0, n, "square"))
    env = env_pts(n, [(0.0, 0.0), (0.01, 1.0), (0.22, 0.9), (0.27, 0.5), (0.3, 0.0)])
    return lp1(buz, 1100.0) * env


def clutch(rng):
    buf = np.zeros(n_of(0.8))
    env = env_pts(n_of(0.3), [(0.0, 0.0), (0.18, 1.0), (0.3, 0.0)])
    place(buf, 0.8 * swish(rng, 0.3, 300.0, 4000.0, env, width=1.5), 0.0)
    for f, t0 in [(1046.5, 0.30), (1318.5, 0.38), (1568.0, 0.46)]:
        place(buf, bell(f, 0.3, tau=0.12, amp=0.6), t0)
    for f in (1046.5, 1318.5, 1568.0):   # triumphant final chord
        place(buf, bell(f, 0.24, tau=0.12, amp=0.45), 0.56)
    return buf


def alt_tab(rng):
    n = n_of(0.15)
    env = env_pts(n, [(0.0, 0.0), (0.04, 1.0), (0.09, 0.6), (0.15, 0.0)])
    return 0.9 * swish(rng, 0.15, 1400.0, 4800.0, env)


def sus_tick(rng):
    n = n_of(0.1)
    t = np.arange(n) / SR
    blip = np.sin(2 * np.pi * 660 * t) * np.minimum(t / 0.002, 1.0) * np.exp(-t / 0.02)
    return blip * np.clip((0.06 - t) / 0.006, 0.0, 1.0)


def caught(rng):
    buf = np.zeros(n_of(1.0))
    sn = n_of(0.35)
    t = np.arange(sn) / SR
    f = 6000.0 * (300.0 / 6000.0) ** (t / 0.35)
    scratch = hp1(lp1(white(rng, sn), f * 1.3), f / 1.3)   # record scratch, sweeping down
    wob = 0.5 + 0.5 * np.sin(phase(25.0, sn))
    env = env_pts(sn, [(0.0, 0.0), (0.01, 1.0), (0.28, 0.8), (0.35, 0.0)])
    place(buf, 0.9 * scratch * wob * env, 0.0)
    cn = n_of(0.65)
    chord = (osc(110.0, cn, "saw") + osc(130.81, cn, "saw") + osc(164.81, cn, "saw")) / 3.0
    chord = lp1(chord, 1000.0) * decay(cn, 0.3, attack=0.005)   # A minor stinger
    sub = np.sin(phase(55.0, cn)) * decay(cn, 0.4, attack=0.005)
    place(buf, 0.6 * chord + 0.5 * sub, 0.35)
    return buf


def brass_note(freq, dur, vib=0.0):
    n = n_of(dur)
    t = np.arange(n) / SR
    f = (freq * (1.0 + 0.02 * np.exp(-t / 0.05))
         * (1.0 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.3 * dur) / 0.3, 0.0, 1.0)))
    src = osc(f, n, "saw") + 0.3 * osc(2.0 * f, n, "saw")
    cut = 350.0 + 900.0 * np.minimum(t / 0.12, 1.0)   # the 'wah' opens
    return lp1(src, cut) * adsr(n, 0.03, 0.05, 0.85, 0.07)


def fired(rng):
    buf = np.zeros(n_of(2.2))
    for f, t0, d, vib in [(293.66, 0.00, 0.42, 0.0), (277.18, 0.45, 0.42, 0.0),
                          (261.63, 0.90, 0.42, 0.0), (246.94, 1.35, 0.85, 0.035)]:
        place(buf, brass_note(f, d, vib), t0)
    return buf


def fun_gain(rng):
    buf = np.zeros(n_of(0.3))
    place(buf, pop(988.0, 0.14, tau=0.05, fc=4500.0), 0.0)
    place(buf, pop(1318.5, 0.2, tau=0.09, fc=4500.0), 0.09)
    t = np.arange(n_of(0.1)) / SR
    place(buf, 0.15 * np.sin(2 * np.pi * 2637 * t) * np.exp(-t / 0.03), 0.09)
    return buf


def quota_done(rng):
    buf = np.zeros(n_of(0.9))
    place(buf, thud(rng, 150.0, 90.0, 0.04, dur=0.12, noise_fc=900.0, noise_amp=0.6), 0.0)
    for f, t0, d in [(392.0, 0.22, 0.12), (523.25, 0.34, 0.12), (659.25, 0.46, 0.42)]:
        place(buf, lead(f, d), t0)
    return buf


def elevator_ding(rng):
    return bell(880.0, 1.4, tau=0.42)


def elevator_move(rng):
    loop = 3.0
    n_loop = n_of(loop)
    total = n_loop + n_of(XFADE_S)
    t = np.arange(total) / SR
    wobble = 0.85 + 0.15 * np.sin(2 * np.pi * 1.0 * t)   # 1 Hz: whole cycles per loop
    hum = (0.55 * np.sin(2 * np.pi * 55.0 * t) + 0.25 * np.sin(2 * np.pi * 110.0 * t)
           + 0.08 * np.sin(2 * np.pi * 165.0 * t))
    rumble = 1.5 * bp(white(rng, total), 120.0, 1000.0)
    return loop_seam((hum + rumble) * wobble, n_loop, equal_power=True)


def shop_buy(rng):
    buf = np.zeros(n_of(0.8))
    n = n_of(0.02)
    t = np.arange(n) / SR
    ka = (hp1(white(rng, n), 3000.0) * np.exp(-t / 0.003)
          + 0.5 * np.sin(2 * np.pi * 3300 * t) * np.exp(-t / 0.002))
    place(buf, 0.8 * ka, 0.0)
    place(buf, bell(2093.0, 0.6, tau=0.2, amp=0.8), 0.1)   # ching
    place(buf, bell(2637.0, 0.5, tau=0.16, amp=0.35), 0.1)
    return buf


def ui_click(rng):
    n = n_of(0.05)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 1200 * t) * np.exp(-t / 0.008) * np.minimum(t / 0.001, 1.0)
    return body + 0.2 * hp1(white(rng, n), 3000.0) * np.exp(-t / 0.002)


def ui_hover(rng):
    n = n_of(0.04)
    t = np.arange(n) / SR
    return 0.5 * np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.006) * np.minimum(t / 0.001, 1.0)


def panel_ok(rng):
    buf = np.zeros(n_of(0.35))
    place(buf, tri_note(660.0, 0.16, tau=0.09), 0.0)
    place(buf, tri_note(990.0, 0.24, tau=0.12), 0.1)
    return buf


def panel_fail(rng):
    buf = np.zeros(n_of(0.35))
    place(buf, tri_note(440.0, 0.16, tau=0.10), 0.0)
    place(buf, tri_note(311.13, 0.24, tau=0.14), 0.12)
    return buf


def drawer(rng):
    buf = np.zeros(n_of(0.7))
    sn = n_of(0.55)
    env = env_pts(sn, [(0.0, 0.0), (0.08, 1.0), (0.45, 0.85), (0.55, 0.0)])
    stick = 0.6 + 0.4 * np.sin(phase(13.0, sn))
    place(buf, 0.8 * swish(rng, 0.55, 280.0, 650.0, env, width=1.15) * stick, 0.0)
    rumble = lp1(osc(np.linspace(55.0, 90.0, sn), sn, "saw"), 240.0)
    place(buf, 0.6 * rumble * env, 0.0)
    place(buf, thud(rng, 90.0, 30.0, 0.05, dur=0.15, noise_fc=500.0, noise_amp=0.3, amp=0.9), 0.58)
    return buf


def pickup(rng):
    n = n_of(0.15)
    t = np.arange(n) / SR
    f = 400.0 * (900.0 / 400.0) ** np.clip(t / 0.12, 0.0, 1.0)
    y = 0.8 * osc(f, n, "sine") + 0.25 * osc(f, n, "tri")
    return y * np.minimum(t / 0.004, 1.0) * np.exp(-t / 0.05)


def drop(rng):
    return thud(rng, 110.0, 50.0, 0.045, dur=0.2, noise_fc=300.0, noise_amp=0.25)


# ------------------------------------------------------ loops (machines, music)

def printer_jam(rng):
    n_loop = n_of(2.0)
    total = n_loop + n_of(XFADE_S)
    t = np.arange(total) / SR
    ph = np.mod(t, 1.0)   # 1 s pattern: beep-beep, then rest; 2.0 s holds two periods
    on = (ph < 0.15) | ((ph >= 0.30) & (ph < 0.45))
    gate = lp1(on.astype(float), 600.0)
    beep = 0.5 * lp1(osc(1200.0, total, "square"), 2600.0) * gate
    grind = 3.0 * bp(white(rng, total), 180.0, 900.0) * (0.6 + 0.4 * np.sin(phase(7.0, total)))
    rumble = 0.15 * np.sin(phase(70.0, total)) * (0.7 + 0.3 * np.sin(phase(2.0, total)))
    return loop_seam(beep + grind + rumble, n_loop, equal_power=True)


FLUTE_MELODY = [("E5", 0, 1), ("G5", 1, 1), ("B5", 2, 2), ("C5", 4, 1), ("E5", 5, 1),
                ("A5", 6, 2), ("F5", 8, 1), ("D5", 9, 1), ("A4", 10, 2), ("B4", 12, 1),
                ("D5", 13, 1), ("F5", 14, 1), ("D5", 15, 1)]


def radio_music(rng):
    beat = 0.5                       # 120 BPM, 4 bars of 4/4 = 8.0 s
    N = n_of(8.0)
    buf = np.zeros(N)
    chords = [["C4", "E4", "G4", "B4"], ["A3", "C4", "E4", "G4"],
              ["D4", "F4", "A4", "C5"], ["G3", "B3", "D4", "F4"]]   # Cmaj7 Am7 Dm7 G7
    bass = [["C2", "E2", "G2", "A2"], ["A1", "C2", "E2", "G2"],
            ["D2", "F2", "A2", "C3"], ["G1", "B1", "D2", "F2"]]
    for bar in range(4):
        b0 = bar * 4 * beat
        for off in (0.0, 1.5, 2.5):   # comping stabs
            for name in chords[bar]:
                place(buf, ep_tone(note_hz(name), 0.9, tau=0.5, amp=0.12), b0 + off * beat, wrap=True)
        for k, name in enumerate(bass[bar]):   # walking bass
            place(buf, bass_note(note_hz(name), beat * 1.2, tau=0.3, amp=0.6), b0 + k * beat, wrap=True)
        for k in range(8):                       # shaker on the eighths
            place(buf, noise_tick(rng, 0.10 if k % 2 == 0 else 0.06, fc=6000.0, tau=0.025),
                  b0 + k * beat / 2, wrap=True)
    for name, b, d in FLUTE_MELODY:
        place(buf, flute(note_hz(name), d * beat, amp=0.22), b * beat, wrap=True)
    return buf


MENU_MELODY = [("E5", 0, 1), ("G5", 1, 0.5), ("A5", 1.5, 0.5), ("G5", 2, 1), ("E5", 3, 1),
               ("C5", 4, 1), ("E5", 5, 0.5), ("D5", 5.5, 0.5), ("C5", 6, 1), ("A4", 7, 1),
               ("F4", 8, 1), ("A4", 9, 0.5), ("C5", 9.5, 0.5), ("F5", 10, 1), ("E5", 11, 1),
               ("D5", 12, 1), ("G4", 13, 0.5), ("B4", 13.5, 0.5), ("D5", 14, 1), ("G5", 15, 1)]


def menu_music(rng):
    beat = 60.0 / 110.0              # 4 bars of 4/4 at 110 BPM
    N = n_of(16 * beat)              # 384873 samples = 8.727 s
    buf = np.zeros(N)
    bars = [["C2", "C3", "C2", "G2"], ["A1", "A2", "A1", "E2"],
            ["F1", "F2", "F1", "C2"], ["G1", "G2", "G1", "D2"]]
    for bar, notes in enumerate(bars):
        for k, name in enumerate(notes):
            place(buf, bass_note(note_hz(name), beat * 0.95, tau=0.3, amp=0.6),
                  (bar * 4 + k) * beat, wrap=True)
    for b in range(0, 16, 2):        # kick on beats 1 and 3 of each bar
        place(buf, kick(0.9), b * beat, wrap=True)
    for m in range(16):              # hat on the offbeat eighths
        place(buf, noise_tick(rng, 0.12, fc=7000.0, tau=0.02), (m + 0.5) * beat, wrap=True)
    for name, b, d in MENU_MELODY:
        place(buf, lead(note_hz(name), d * beat, amp=0.35, vib=0.003), b * beat, wrap=True)
    return buf


def flush(rng):
    n = n_of(1.6)
    t = np.arange(n) / SR
    fc = 4000.0 * (250.0 / 4000.0) ** np.clip(t / 1.2, 0.0, 1.0)
    rush = lp1(white(rng, n), fc)
    env = env_pts(n, [(0.0, 0.0), (0.3, 1.0), (1.0, 0.7), (1.3, 0.25), (1.6, 0.0)])
    buf = rush * env + 0.25 * np.sin(phase(60.0, n)) * env
    for _ in range(14):              # gurgle
        t0 = rng.uniform(0.9, 1.5)
        fb = rng.uniform(260.0, 520.0)
        m = n_of(0.05)
        tb = np.arange(m) / SR
        bubble = (np.sin(phase(fb * (1.0 + 2.0 * np.exp(-tb / 0.02)), m))
                  * np.exp(-tb / 0.025) * np.minimum(tb / 0.002, 1.0))
        place(buf, rng.uniform(0.2, 0.45) * bubble, t0)
    return buf


def fish_reel(rng):
    N = n_of(1.0)                    # 18 ticks per second, exactly 18 per loop
    buf = np.zeros(N)
    n = n_of(0.02)
    t = np.arange(n) / SR
    for k in range(18):
        amp = 1.0 if k % 2 == 0 else 0.75
        click = (np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.003)
                 + 0.5 * hp1(white(rng, n), 3500.0) * np.exp(-t / 0.0015))
        click *= np.minimum(t / 0.0005, 1.0)   # 0.5 ms ramp: no step at the loop seam
        place(buf, amp * click, k / 18.0, wrap=True)
    return buf


def office_ambience(rng):
    n_loop = n_of(12.0)
    total = n_loop + n_of(XFADE_S)
    room = lp1(brown(rng, total), 400.0)
    room = room / (np.std(room) + 1e-12) * 0.05
    ticks = np.zeros(total)
    for _ in range(9):               # distant keyboard clusters
        t0 = rng.uniform(0.5, 11.2)
        for j in range(int(rng.integers(2, 5))):
            m = n_of(0.02)
            tb = np.arange(m) / SR
            tick = (lp1(white(rng, m), 2500.0) * np.exp(-tb / 0.003)
                    + 0.3 * np.sin(2 * np.pi * 2000 * tb) * np.exp(-tb / 0.002))
            place(ticks, 0.25 * tick, t0 + j * rng.uniform(0.06, 0.09))
    m = n_of(0.16)                   # one faint phone chirp
    tb = np.arange(m) / SR
    chirp = (np.sin(phase(1400.0 + 300.0 * np.clip(tb / 0.12, 0.0, 1.0), m))
             * np.minimum(tb / 0.005, 1.0) * np.exp(-tb / 0.07))
    place(ticks, 0.06 * chirp, 7.4)
    return loop_seam(room + ticks, n_loop, equal_power=True)


def heartbeat(rng):
    N = n_of(4.0 / 3.0)              # 58800 samples: two 90 BPM beats, exact
    buf = np.zeros(N)
    beat = 2.0 / 3.0
    for k in range(2):
        t0 = k * beat
        place(buf, thud(rng, 75.0, 30.0, 0.05, dur=0.25, noise_fc=180.0, noise_amp=0.2, amp=1.0),
              t0, wrap=True)                 # lub
        place(buf, thud(rng, 62.0, 20.0, 0.045, dur=0.22, noise_fc=180.0, noise_amp=0.2, amp=0.7),
              t0 + 0.18, wrap=True)          # dub
    return buf


# ------------------------------------------------------- gibberish voices

def boss_grumble(rng):
    n = n_of(0.9)
    t = np.arange(n) / SR
    jit = lp1(white(rng, n), 7.0)
    jit = jit / (np.max(np.abs(jit)) + 1e-12)
    base = 170.0 + 12.0 * np.sin(2 * np.pi * 3.0 * t) + 75.0 * np.clip((t - 0.6) / 0.3, 0.0, 1.0) ** 2
    f = base * (1.0 + 0.02 * jit)                     # question-mark lift at the end
    formants = [(320.0, 120.0, 1.0), (1150.0, 170.0, 0.5), (2600.0, 260.0, 0.15)]  # nasal "mm"
    env = env_pts(n, [(0.0, 0.0), (0.03, 1.0), (0.22, 0.9), (0.31, 0.25), (0.37, 0.0),
                      (0.44, 0.0), (0.48, 0.9), (0.62, 1.0), (0.76, 0.85), (0.9, 0.0)])
    return lp1(voice(f, n, formants), 2800.0) * env


def boss_shout(rng):
    n = n_of(0.6)
    t = np.arange(n) / SR
    f = np.where(t < 0.28, 340.0 - 50.0 * t / 0.28,
                 300.0 - 120.0 * np.clip((t - 0.3) / 0.3, 0.0, 1.0))
    hey = voice(f, n, [(620.0, 110.0, 1.0), (1900.0, 180.0, 0.5), (2700.0, 300.0, 0.2)])
    hey *= env_pts(n, [(0.0, 0.0), (0.01, 1.0), (0.2, 0.9), (0.27, 0.0)])
    ey = voice(f, n, [(450.0, 100.0, 1.0), (2300.0, 200.0, 0.45)])
    ey *= env_pts(n, [(0.0, 0.0), (0.3, 0.0), (0.33, 1.0), (0.5, 0.9), (0.6, 0.0)])
    return lp1(hey + ey, 3500.0)


# ------------------------------------------------------ stingers & fx

def chase_sting(rng):
    buf = np.zeros(n_of(1.2))
    ds = 0.9
    m = n_of(ds)
    x = np.clip(np.arange(m) / SR / ds, 0.0, 1.0)
    f = 196.0 * 2.0 ** (1.6 * x)                              # rising string line
    trem = 0.45 + 0.55 * np.sin(phase(5.0 + 20.0 * x, m))     # tremolo speeds up
    strings = 0.5 * (osc(f * 1.006, m, "saw") + osc(f * 0.994, m, "saw"))  # detuned pair
    strings = lp1(strings, 2200.0 + 1800.0 * x)
    swell = env_pts(m, [(0.0, 0.0), (0.08, 0.4), (ds, 1.0)])
    place(buf, 0.7 * strings * trem * swell, 0.0)
    place(buf, thud(rng, 60.0, 30.0, 0.2, dur=0.35, noise_fc=900.0, noise_amp=0.4), ds)
    cn = n_of(0.3)
    chord = (osc(110.0, cn, "saw") + osc(164.81, cn, "saw") + osc(220.0, cn, "saw")) / 3.0
    chord = lp1(chord, 1400.0) * decay(cn, 0.12, attack=0.004)
    place(buf, 0.45 * chord, ds)
    return buf


def heist_done(rng):
    buf = np.zeros(n_of(1.8))
    for name, t0, d in [("G4", 0.00, 0.13), ("C5", 0.14, 0.13), ("E5", 0.28, 0.13),
                        ("G5", 0.42, 0.13), ("C6", 0.56, 0.30), ("E6", 0.90, 0.90)]:
        place(buf, lead(note_hz(name), d, amp=0.7, harmony=0.8, fc=4000.0), t0)
    return buf


def chew(rng):
    buf = np.zeros(n_of(0.8))
    for k, t0 in enumerate([0.02, 0.28, 0.52]):
        n = n_of(0.22)
        t = np.arange(n) / SR
        env = env_pts(n, [(0.0, 0.0), (0.02, 1.0), (0.1, 0.5), (0.14, 0.9), (0.2, 0.2), (0.22, 0.0)])
        fc = 500.0 + 2100.0 * np.exp(-t / 0.08)           # jaw closes, muffling
        crunch = lp1(white(rng, n), fc) * env
        click = hp1(white(rng, n), 3000.0) * np.exp(-t / 0.004) * 0.3
        place(buf, (1.4 * crunch + click) * (1.0 - 0.1 * k), t0)
    return buf


def paper_throw(rng):
    n = n_of(0.25)
    env = env_pts(n, [(0.0, 0.0), (0.04, 1.0), (0.12, 0.7), (0.25, 0.0)])
    return swish(rng, 0.25, 600.0, 4500.0, env, width=1.4)


def basket_swish(rng):
    buf = np.zeros(n_of(0.4))
    env = env_pts(n_of(0.25), [(0.0, 0.0), (0.05, 1.0), (0.2, 0.6), (0.25, 0.0)])
    place(buf, 0.7 * swish(rng, 0.25, 900.0, 3500.0, env, width=1.25), 0.0)
    for _ in range(12):              # paper rustle
        t0 = rng.uniform(0.03, 0.3)
        m = n_of(0.012)
        tb = np.arange(m) / SR
        crackle = hp1(white(rng, m), 2000.0) * np.exp(-tb / 0.002)
        place(buf, rng.uniform(0.3, 0.8) * crackle, t0)
    place(buf, thud(rng, 160.0, 40.0, 0.03, dur=0.12, noise_fc=700.0, noise_amp=0.3, amp=0.5), 0.3)
    return buf


def pew(rng):
    n = n_of(0.12)
    t = np.arange(n) / SR
    f = 1400.0 - 1100.0 * np.clip(t / 0.12, 0.0, 1.0)
    return lp1(osc(f, n, "square"), 3000.0) * np.minimum(t / 0.002, 1.0) * np.exp(-t / 0.05)


def boom(rng):
    n = n_of(0.4)
    t = np.arange(n) / SR
    fc = 3500.0 * (200.0 / 3500.0) ** np.clip(t / 0.3, 0.0, 1.0)
    noise = lp1(white(rng, n), fc) * np.exp(-t / 0.1) * np.minimum(t / 0.002, 1.0)
    sub = np.sin(phase(90.0 * (1.0 - 0.5 * np.clip(t / 0.3, 0.0, 1.0)), n)) * np.exp(-t / 0.12)
    return 1.8 * noise + 0.6 * sub


def fish_bite(rng):
    buf = np.zeros(n_of(0.3))
    n = n_of(0.14)
    t = np.arange(n) / SR
    f = 900.0 * (200.0 / 900.0) ** np.clip(t / 0.12, 0.0, 1.0)
    place(buf, np.sin(phase(f, n)) * np.minimum(t / 0.003, 1.0) * np.exp(-t / 0.05), 0.0)
    for _ in range(6):               # bubbles
        t0 = rng.uniform(0.1, 0.26)
        fb = rng.uniform(500.0, 1200.0)
        m = n_of(0.03)
        tb = np.arange(m) / SR
        bub = np.sin(phase(fb * (1.0 + 1.5 * np.exp(-tb / 0.008)), m)) * np.exp(-tb / 0.01)
        place(buf, rng.uniform(0.25, 0.5) * bub, t0)
    return buf


def day_end_bell(rng):
    buf = np.zeros(n_of(1.8))
    for t0 in (0.0, 0.6, 1.2):       # three rings of a factory-ish bell
        place(buf, bell(261.63, 1.6, tau=0.3, amp=0.9, ratios=(1.0, 2.32, 4.25, 6.63)), t0)
        m = n_of(0.02)
        tb = np.arange(m) / SR
        place(buf, 0.3 * hp1(white(rng, m), 2500.0) * np.exp(-tb / 0.004), t0)
    return buf


# ------------------------------------------------------------- registry

SOUNDS = [
    ("door_open.wav", door_open, {}),
    ("door_close.wav", door_close, {}),
    ("boss_step_1.wav", boss_step_1, {}),
    ("boss_step_2.wav", boss_step_2, {}),
    ("boss_step_3.wav", boss_step_3, {}),
    ("step_soft.wav", step_soft, {}),
    ("lamp_on.wav", lamp_on, {}),
    ("typing.wav", typing, {}),
    ("rhythm_hit.wav", rhythm_hit, {}),
    ("rhythm_perfect.wav", rhythm_perfect, {}),
    ("rhythm_miss.wav", rhythm_miss, {}),
    ("sort_ok.wav", sort_ok, {}),
    ("sort_bad.wav", sort_bad, {}),
    ("clutch.wav", clutch, {}),
    ("alt_tab.wav", alt_tab, {}),
    ("sus_tick.wav", sus_tick, {}),
    ("caught.wav", caught, {}),
    ("fired.wav", fired, {}),
    ("fun_gain.wav", fun_gain, {}),
    ("quota_done.wav", quota_done, {}),
    ("elevator_ding.wav", elevator_ding, {}),
    ("elevator_move.wav", elevator_move, {"loop": True}),
    ("shop_buy.wav", shop_buy, {}),
    ("ui_click.wav", ui_click, {}),
    ("ui_hover.wav", ui_hover, {}),
    ("panel_ok.wav", panel_ok, {}),
    ("panel_fail.wav", panel_fail, {}),
    ("drawer.wav", drawer, {}),
    ("pickup.wav", pickup, {}),
    ("drop.wav", drop, {}),
    ("printer_jam.wav", printer_jam, {"loop": True}),
    ("radio_music.wav", radio_music, {"loop": True}),
    ("flush.wav", flush, {}),
    ("basket_swish.wav", basket_swish, {}),
    ("paper_throw.wav", paper_throw, {}),
    ("chew.wav", chew, {}),
    ("chase_sting.wav", chase_sting, {}),
    ("heist_done.wav", heist_done, {}),
    ("pew.wav", pew, {}),
    ("boom.wav", boom, {}),
    ("fish_bite.wav", fish_bite, {}),
    ("fish_reel.wav", fish_reel, {"loop": True}),
    ("office_ambience.wav", office_ambience, {"loop": True, "peak": -12.0}),
    ("day_end_bell.wav", day_end_bell, {}),
    ("menu_music.wav", menu_music, {"loop": True, "peak": -6.0}),
    ("boss_grumble.wav", boss_grumble, {}),
    ("boss_shout.wav", boss_shout, {}),
    ("heartbeat.wav", heartbeat, {"loop": True}),
]


def save(name, y, peak_db=-1.0, fade=True):
    y = np.array(y, dtype=float)
    if fade:
        m = min(n_of(0.005), len(y) // 2)
        ramp = np.linspace(0.0, 1.0, m)
        y[:m] *= ramp
        y[len(y) - m:] *= ramp[::-1]
    peak = float(np.max(np.abs(y)))
    if peak <= 0.0:
        raise RuntimeError(f"{name}: generated silence")
    y = y / peak * 10.0 ** (peak_db / 20.0)
    pcm = np.clip(np.round(y * 32767.0), -32768, 32767).astype("<i2")
    path = os.path.join(OUT_DIR, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path, len(y) / SR


def main():
    assert len(SOUNDS) == 48, f"expected 48 sounds, got {len(SOUNDS)}"
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for name, fn, opts in SOUNDS:
        rng = np.random.default_rng(zlib.crc32(name.encode("ascii")))
        loop = opts.get("loop", False)
        path, dur = save(name, fn(rng), opts.get("peak", -1.0), fade=not loop)
        size = os.path.getsize(path)
        total += size
        tag = "LOOP" if loop else ""
        print(f"{name:22s} {dur:7.3f} s {size / 1024:8.1f} KB {tag}")
    print(f"{len(SOUNDS)} files, {total / 1024 / 1024:.2f} MB -> {OUT_DIR}")


if __name__ == "__main__":
    main()
