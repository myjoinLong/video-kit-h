#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recording QC + (optionally) one-command audio replacement for an episode.

Two modes:

  TAKE   --take your_voice.wav     analyse the finished narration: length, sample
                                   rate, peak, clipping, silence gaps, per-chapter
                                   energy; with --mux, produce films with your voice.

  SAMPLE --take sample.wav --sample --chars 120
                                   analyse a short voice SAMPLE only: speaking rate,
                                   pause habits, loudness. Tells you whether the
                                   current script fits YOUR natural pace and how
                                   many characters each chapter should be.

IMPORTANT: this tool does NOT clone a voice. Turning a short sample into a full
narration in the same timbre needs a locally deployed TTS/voice-cloning model
(e.g. GPT-SoVITS / CosyVoice / fish-speech) plus its weights. This project does
not bundle one. What a sample CAN do here is calibrate pace, pauses and levels,
and build a per-chapter recording guide that matches how you actually speak.

Usage:
  python tools/check-recording.py --episode episodes/<slug> --take ~/vo.wav
  python tools/check-recording.py --episode episodes/<slug> --take ~/vo.wav --mux
  python tools/check-recording.py --episode episodes/<slug> --take ~/sample.wav --sample --chars 120
"""
import argparse
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44100


def decode(path):
    """Decode to mono by AVERAGING channels in numpy.

    ffmpeg's `-ac 1` uses a power-preserving down-mix, which multiplies a
    dual-mono signal by sqrt(2) and would make the QC falsely report clipping.
    """
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR),
         "-f", "f32le", "pipe:1"], check=True, capture_output=True)
    x = np.frombuffer(p.stdout, dtype=np.float32).copy()
    n = len(x) // 2 * 2
    return x[:n].reshape(-1, 2).mean(axis=1)


def fmt_time(s):
    m, sec = divmod(s, 60)
    return f"{int(m):02d}:{sec:06.3f}"


def frames_energy(x, hop=0.020):
    n = int(hop * SR)
    if n <= 0 or len(x) < n:
        return np.array([], dtype=np.float32)
    x = x[:len(x) // n * n].reshape(-1, n)
    return np.sqrt((x * x).mean(axis=1)).astype(np.float32)


def analyse(x, threshold=0.012):
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    rms = float(np.sqrt((x * x).mean())) if len(x) else 0.0
    clip = int(np.count_nonzero(np.abs(x) >= 0.999))
    e = frames_energy(x)
    voiced = e > threshold
    # longest silent run (seconds)
    longest, cur = 0, 0
    gaps = []
    for v in voiced:
        if not v:
            cur += 1
            longest = max(longest, cur)
        else:
            if cur >= 3:
                gaps.append(round(cur * 0.020, 3))
            cur = 0
    if cur >= 3:
        gaps.append(round(cur * 0.020, 3))
    voiced_sec = float(np.count_nonzero(voiced) * 0.020)
    return {
        "peakDbfs": round(20 * np.log10(max(peak, 1e-9)), 2),
        "rmsDbfs": round(20 * np.log10(max(rms, 1e-9)), 2),
        "clippedSamples": clip,
        "voicedSec": round(voiced_sec, 2),
        "voicedRatio": round(voiced_sec / max(len(x) / SR, 1e-6), 3),
        "longestSilenceSec": round(longest * 0.020, 2),
        "pausesOver100ms": len(gaps),
        "meanPauseSec": round(float(np.mean(gaps)), 2) if gaps else 0.0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--take", required=True, help="your recorded audio (wav/mp3/m4a/flac)")
    ap.add_argument("--sample", action="store_true", help="treat --take as a short voice sample")
    ap.add_argument("--chars", type=int, default=0, help="character count spoken in the sample")
    ap.add_argument("--mux", action="store_true", help="replace the silent track in every film")
    ap.add_argument("--loudnorm", action="store_true", default=True,
                    help="normalise loudness before muxing (default on)")
    ap.add_argument("--no-loudnorm", dest="loudnorm", action="store_false")
    ap.add_argument("--report", default=None)
    args = ap.parse_args()

    ep_dir = Path(args.episode).resolve()
    ep = json.loads((ep_dir / "episode.json").read_text(encoding="utf-8"))
    chapters = ep["chapters"]
    duration = float(ep["duration"])
    x = decode(args.take)
    got = len(x) / SR
    stats = analyse(x)
    vdir = ep_dir / "voice"
    vdir.mkdir(parents=True, exist_ok=True)

    report = {
        "episode": ep["id"], "take": os.path.basename(args.take), "mode": "sample" if args.sample else "take",
        "durationSec": round(got, 3), "targetSec": duration,
        "deltaSec": round(got - duration, 3), "sampleRate": SR, "analysis": stats,
        "chapters": [], "warnings": [], "outputs": [],
    }

    if not args.sample:
        if abs(got - duration) > 0.150:
            report["warnings"].append(
                f"录音 {got:.3f}s 与目标 {duration:.3f}s 相差 {got - duration:+.3f}s；"
                "对齐时应按 chapters 的 in/out 分段微调，不要整体拉伸整条音轨。")
        if stats["clippedSamples"] > 0:
            report["warnings"].append(f"检测到 {stats['clippedSamples']} 个削波样本，建议降增益重录。")
        if stats["peakDbfs"] > -1.0:
            report["warnings"].append("峰值过高（> -1 dBFS），建议留 3 dB 余量。")
        if stats["peakDbfs"] < -24:
            report["warnings"].append("整体电平偏低，mux 时会做响度标准化。")

        for c in chapters:
            a, b = float(c["in"]), float(c["out"])
            seg = x[int(a * SR):min(len(x), int(b * SR))]
            e = frames_energy(seg)
            active = float(np.count_nonzero(e > 0.012) * 0.020) if len(e) else 0.0
            report["chapters"].append({
                "id": c["id"], "in": a, "out": b, "title": c["title"],
                "scriptChars": len(c["narration"]),
                "voicedSec": round(active, 2),
                "fillRatio": round(active / max(b - a, 1e-6), 3),
                "verdict": "ok" if 0.35 <= active / max(b - a, 1e-6) <= 0.94 else "check",
            })
            if report["chapters"][-1]["verdict"] == "check":
                report["warnings"].append(
                    f"第 {c['id']} 段（{fmt_time(a)}–{fmt_time(b)}）有声 {active:.1f}s / 窗口 {b-a:.1f}s，"
                    "过空或过满，建议单独重录该段。")

        if args.mux:
            # pad / trim to the exact episode length, never touch the user's source file
            total = int(round(duration * SR))
            y = np.zeros(total, dtype=np.float32)
            y[:min(total, len(x))] = x[:min(total, len(x))]
            tmp = vdir / "_take-padded.wav"
            sf.write(str(tmp), np.stack([y, y], axis=1), SR, subtype="PCM_16")
            if args.loudnorm:
                norm = vdir / "_take-normalised.wav"
                subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp),
                                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                                "-ar", str(SR), "-ac", "2", str(norm)], check=True)
                src = norm
            else:
                src = tmp
            for film in sorted(glob.glob(str(ep_dir / "out" / "*.mp4"))):
                if "reference-vo" in film or "-voiced" in film:
                    continue
                dst = str(Path(film).with_name(Path(film).stem + "-voiced.mp4"))
                subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", film, "-i", str(src),
                                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                                "-c:a", "aac", "-b:a", "320k", "-ar", str(SR), "-ac", "2",
                                "-t", f"{duration:.3f}", "-movflags", "+faststart", dst], check=True)
                report["outputs"].append(os.path.basename(dst))
            tmp.unlink(missing_ok=True)
            if args.loudnorm:
                norm.unlink(missing_ok=True)
    else:
        # ---- sample mode: calibrate the script to the speaker's real pace ----
        # "Delivery pace" uses the whole read-through span (minus leading /
        # trailing silence), because that is the time actually occupied on the
        # timeline. Counting only voiced frames would report an unrealistic
        # 340+ wpm and make the script look far too short.
        e = frames_energy(x)
        idx = np.where(e > 0.012)[0]
        span = (idx[-1] - idx[0] + 1) * 0.020 if len(idx) else got
        wpm = (args.chars / (span / 60.0)) if (args.chars and span > 0.5) else None
        pure = (args.chars / (stats["voicedSec"] / 60.0)) if (args.chars and stats["voicedSec"] > 0.5) else None
        report["sampleAnalysis"] = {
            "charsInSample": args.chars,
            "readSpanSec": round(span, 2),
            "speakingRateWpm": round(wpm, 1) if wpm else None,
            "pureVoicedWpm": round(pure, 1) if pure else None,
            "meanPauseSec": stats["meanPauseSec"],
            "pausesOver100ms": stats["pausesOver100ms"],
            "note": "speakingRateWpm 按去掉首尾静音后的朗读跨度计算（含句间停顿），用于估算占片时长；pureVoicedWpm 只算实际发声帧，仅作参考。未提供 --chars 时只报节奏与电平。",
        }
        total_chars = sum(len(c["narration"]) for c in chapters)
        if wpm:
            need = total_chars / wpm * 60.0
            report["sampleAnalysis"]["scriptSecondsAtYourPace"] = round(need, 1)
            report["sampleAnalysis"]["episodeWindowSec"] = duration
            report["sampleAnalysis"]["paceVerdict"] = (
                "你的语速在 240 秒窗口内够用" if need <= duration * 0.93 else
                "按你的语速稿子偏长，需要删字或提速")
            report["sampleAnalysis"]["suggestedCharsPerChapter"] = [
                {"id": c["id"], "windowSec": round(float(c["out"]) - float(c["in"]), 1),
                 "currentChars": len(c["narration"]),
                 "suggestedChars": round((float(c["out"]) - float(c["in"]) - 1.2) / 60 * wpm * 0.92)}
                for c in chapters
            ]
        report["canDo"] = [
            "按你的真实语速重算每段字数与时间码，改 episode.json 后重新 build",
            "把样音剪成每段开头的示范片段，录的时候照着找感觉",
            "录完用本脚本 --take --mux 自动对齐、响度标准化并替换音轨",
        ]
        report["cannotDo"] = [
            "声音克隆：把几十秒样音变成整段同音色旁白，需要本地部署 GPT-SoVITS / CosyVoice / fish-speech 等模型及权重，本项目不含",
        ]

    path = Path(args.report) if args.report else (vdir / ("sample-analysis.json" if args.sample else "recording-report.json"))
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.sample:
        print(f"[rec] sample      : {args.take}  {got:.3f}s (短样音，不与 {duration:.3f}s 成片时长比较)")
    else:
        print(f"[rec] take        : {args.take}  {got:.3f}s (target {duration:.3f}s, delta {got-duration:+.3f}s)")
    print(f"[rec] peak/rms    : {stats['peakDbfs']} / {stats['rmsDbfs']} dBFS, clipped {stats['clippedSamples']}")
    print(f"[rec] voiced      : {stats['voicedSec']}s, longest silence {stats['longestSilenceSec']}s, pauses {stats['pausesOver100ms']}")
    if args.sample and report["sampleAnalysis"].get("speakingRateWpm"):
        sa = report["sampleAnalysis"]
        print(f"[rec] your pace   : {sa['speakingRateWpm']} wpm -> script needs {sa['scriptSecondsAtYourPace']}s / {duration}s  [{sa['paceVerdict']}]")
    if report["outputs"]:
        print("[rec] muxed       : " + ", ".join(report["outputs"]))
    for wmsg in report["warnings"]:
        print("[rec] ! " + wmsg)
    print(f"[rec] report      : {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
