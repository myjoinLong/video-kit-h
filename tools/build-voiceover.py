#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Reference voice-over builder for the talking-head production line.

Reads ANY episode's `episode.json` (chapters[].narration + in/out), synthesises a
Chinese read-through with edge-tts, fits every chapter into its on-screen time
window, and writes a sample-accurate reference track plus per-chapter files,
a 90 BPM click track, and optional "reference VO" MP4s (video stream copied,
only the silent placeholder audio is replaced).

This is a *reference* track: it exists so a human narrator can hear pace and
pauses before recording. It is never the shipped voice-over of a finished film.

Requirements: python -m pip install edge-tts numpy soundfile ; ffmpeg on PATH.
Network is needed for the synthesis call; --no-synth keeps the click track only.

Usage:
  python tools/build-voiceover.py --episode episodes/<slug>
  python tools/build-voiceover.py --episode episodes/<slug> --voice zh-CN-YunxiNeural
  python tools/build-voiceover.py --episode episodes/<slug> --no-synth
"""
import argparse
import asyncio
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44100
LEAD = 0.35          # silence before each chapter's first word
TAIL = 0.80          # breathing room at the end of each chapter
FADE = 0.020         # 20 ms fades, avoids clicks at segment joins
BASE_WPM = 270.0     # measured zh-CN-XiaoxiaoNeural pace at rate=+0% (chars/min)
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"


def run(cmd, capture=False):
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.DEVNULL)


def probe_duration(path):
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True)
    return float(p.stdout.strip())


def decode_mono(path, atempo=1.0):
    """Decode audio -> mono float32 at SR, optionally time-stretched (no pitch shift)."""
    af = "aresample=44100" if abs(atempo - 1.0) < 1e-4 else f"atempo={atempo:.6f},aresample=44100"
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-af", af, "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "pipe:1"],
        check=True, capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def edge_synth(text, voice, rate_pct, out_path):
    import edge_tts

    async def _go():
        c = edge_tts.Communicate(text, voice, rate=f"{rate_pct:+.0f}%")
        await c.save(str(out_path))

    asyncio.run(_go())


def with_fades(seg):
    n = int(FADE * SR)
    if len(seg) < 2 * n + 10:
        return seg
    seg[:n] *= np.linspace(0, 1, n, dtype=np.float32)
    seg[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
    return seg


def build_click_track(duration, chapters, bpm=90.0, offset=0.4):
    """Quiet metronome: one click per beat, accented downbeats, double beep at each chapter start."""
    n = int(round(duration * SR))
    tr = np.zeros(n, dtype=np.float32)
    beat = 60.0 / bpm

    def click(at, freq, gain, length=0.050):
        s = int(round(at * SR))
        if s < 0 or s >= n:
            return
        m = min(int(length * SR), n - s)
        env = np.exp(-np.linspace(0, 7, m, dtype=np.float32))
        tr[s:s + m] += (gain * env * np.sin(2 * np.pi * freq * np.arange(m) / SR)).astype(np.float32)

    nb = int(duration / beat) + 1
    for i in range(nb):
        t = offset + i * beat
        if t >= duration:
            break
        bar = (i % 4 == 0)
        click(t, 1320 if bar else 880, 0.20 if bar else 0.11)
    for c in chapters:
        click(float(c["in"]), 1760, 0.30, 0.070)
        click(float(c["in"]) + 0.14, 1760, 0.22, 0.070)
    return tr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True, help="episode directory containing episode.json")
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--base-wpm", type=float, default=BASE_WPM)
    ap.add_argument("--rate", type=float, default=None,
                    help="override edge-tts rate in %% (auto-estimated when omitted)")
    ap.add_argument("--no-synth", action="store_true", help="click track only, no network calls")
    ap.add_argument("--no-mux", action="store_true", help="do not create reference-VO MP4s")
    ap.add_argument("--gain", type=float, default=0.92)
    args = ap.parse_args()

    ep_dir = Path(args.episode).resolve()
    ep = json.loads((ep_dir / "episode.json").read_text(encoding="utf-8"))
    chapters = ep["chapters"]
    duration = float(ep["duration"])
    bpm = float(ep.get("bpm", 90))
    offset = float(ep.get("offset", 0.4))
    vdir = ep_dir / "voice"
    sdir = vdir / "segments"
    vdir.mkdir(parents=True, exist_ok=True)
    sdir.mkdir(parents=True, exist_ok=True)

    total_chars = sum(len(c["narration"]) for c in chapters)
    total_budget = sum(float(c["out"]) - float(c["in"]) - LEAD - TAIL for c in chapters)
    needed_wpm = total_chars / (total_budget / 60.0)

    print(f"[voice] episode      : {ep['id']}")
    print(f"[voice] chapters     : {len(chapters)} / {total_chars} chars / {duration:.3f}s")
    print(f"[voice] overall pace : {needed_wpm:.1f} wpm  /  base {args.base_wpm:.0f} wpm  /  voice {args.voice}")
    if args.rate is not None:
        print(f"[voice] fixed rate   : {args.rate:+.1f}% (per-chapter auto-pace disabled)")

    total_len = int(round(duration * SR))
    track = np.zeros(total_len, dtype=np.float32)
    report_ch = []
    warnings = []

    for i, c in enumerate(chapters, 1):
        a, b = float(c["in"]), float(c["out"])
        budget = max(0.8, b - a - LEAD - TAIL)
        rec = {"id": c["id"], "in": a, "out": b, "title": c["title"],
               "chars": len(c["narration"]), "budgetSec": round(budget, 3)}
        if not args.no_synth:
            # Pace each chapter at the speed its own on-screen window requires,
            # at the SYNTHESIS stage (natural sounding) instead of stretching the
            # finished waveform by 20% (which sounds like slow-motion).
            need_ch_wpm = len(c["narration"]) / (budget / 60.0)
            rate_ch = args.rate if args.rate is not None else max(
                -30.0, min(25.0, (need_ch_wpm / args.base_wpm - 1) * 100))
            rec["targetWpm"] = round(need_ch_wpm, 1)
            rec["ratePercent"] = round(rate_ch, 1)
            mp3 = sdir / f"{i:02d}.mp3"
            try:
                edge_synth(c["narration"], args.voice, rate_ch, mp3)
            except Exception as e:                       # noqa: BLE001 - network failure is recoverable
                warnings.append(f"chapter {i}: synthesis failed ({e}); skipped")
                print(f"[voice] ! chapter {i} synthesis failed: {e}")
                report_ch.append({**rec, "status": "synth-failed"})
                continue
            natural = probe_duration(mp3)
            # Only a small residual correction; anything beyond this stays as
            # intentional breathing room at the end of the chapter.
            stretch = float(np.clip(natural / budget, 0.94, 1.18))
            seg = with_fades(decode_mono(mp3, stretch))
            if len(seg) / SR > budget + 0.15:
                warnings.append(f"chapter {i}: speech still {len(seg)/SR:.2f}s > {budget:.2f}s window")
            start = int(round((a + LEAD) * SR))
            end = min(total_len, start + len(seg))
            track[start:end] += seg[:end - start]
            rec.update({"status": "ok", "file": f"voice/segments/{i:02d}.mp3",
                        "naturalSec": round(natural, 3), "atempo": round(stretch, 4),
                        "spokenSec": round(len(seg) / SR, 3),
                        "placedAt": round((a + LEAD), 3),
                        "paceWpm": round(len(c["narration"]) / ((len(seg) / SR) / 60), 1)})
        else:
            rec["status"] = "skipped (--no-synth)"
        report_ch.append(rec)
        if rec["status"] == "ok":
            print(f"[voice] {i:02d} {rec['naturalSec']:>6.2f}s natural -> "
                  f"atempo {rec['atempo']:.3f} -> {rec['spokenSec']:>6.2f}s in {budget:.2f}s window")

    # peak-normalise, never clip
    peak = float(np.max(np.abs(track)))
    if peak > 0:
        track *= min(1.0, 0.89 / peak) * args.gain
    stereo = np.stack([track, track], axis=1)
    wav_path = vdir / "reference-vo.wav"
    sf.write(str(wav_path), stereo, SR, subtype="PCM_16")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(wav_path), "-c:a", "libmp3lame",
         "-b:a", "320k", str(vdir / "reference-vo.mp3")])

    click = build_click_track(duration, chapters, bpm, offset)
    click *= 0.85
    sf.write(str(vdir / "click-track.wav"), np.stack([click, click], axis=1), SR, subtype="PCM_16")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(vdir / "click-track.wav"),
         "-c:a", "libmp3lame", "-b:a", "192k", str(vdir / "click-track.mp3")])

    # sample-accurate length check
    info = sf.info(str(wav_path))
    assert info.frames == total_len, f"WAV length {info.frames} != {total_len}"

    muxed = []
    if not args.no_mux:
        for film in sorted(glob.glob(str(ep_dir / "out" / "*.mp4"))):
            if "reference-vo" in film:
                continue
            dst = str(Path(film).with_name(Path(film).stem + "-reference-vo.mp4"))
            run(["ffmpeg", "-y", "-v", "error", "-i", film, "-i", str(wav_path),
                 "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                 "-c:a", "aac", "-b:a", "320k", "-ar", str(SR), "-ac", "2",
                 "-t", f"{duration:.3f}", "-movflags", "+faststart", dst])
            muxed.append(os.path.basename(dst))

    report = {
        "episode": ep["id"], "kind": "AI reference voice-over (NOT the shipped narration)",
        "engine": f"edge-tts {args.voice}",
        "rateMode": "fixed" if args.rate is not None else "per-chapter auto",
        "fixedRatePercent": args.rate,
        "baseWpm": args.base_wpm, "overallNeededWpm": round(needed_wpm, 1),
        "duration": duration, "sampleRate": SR, "samples": total_len,
        "peakBeforeNorm": round(peak, 4), "totalChars": total_chars,
        "outputs": ["voice/reference-vo.wav", "voice/reference-vo.mp3",
                    "voice/click-track.wav", "voice/click-track.mp3",
                    "voice/segments/01..%02d.mp3" % len(chapters)] + muxed,
        "chapters": report_ch, "warnings": warnings,
        "note": "Reference only. Record your own voice and use tools/check-recording.py --mux to ship.",
    }
    (vdir / "voiceover-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[voice] wrote {wav_path.name}  {total_len} samples / {duration:.3f}s")
    print(f"[voice] muxed reference films: {', '.join(muxed) if muxed else '(none)'}")
    if warnings:
        print(f"[voice] warnings: {len(warnings)}")
        for wmsg in warnings:
            print("   -", wmsg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
