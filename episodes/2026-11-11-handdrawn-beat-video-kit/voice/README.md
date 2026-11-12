# 首期音频资产

> 音频本体（`*.wav` / `*.mp3`）**不入库**，只留在本地；`manifest.json` 的 `audio.files` 记了每个文件的
> SHA-256 与体积。clone 本仓库后按下面命令可重新生成完全相同的参考音轨（联网 TTS 结果可能有极小差异）。

## 目录内容

| 文件 | 说明 |
|---|---|
| `reference-vo.wav` / `.mp3` | 240.000 秒 AI 示范朗读，7 章逐章贴合各自时间窗（44.1 kHz 立体声） |
| `segments/01..07.mp3` | 逐章朗读，录哪段听哪段 |
| `click-track.wav` / `.mp3` | 90 BPM 点击轨：每拍一响、小节重音、每章开头双响；录音时戴耳机听，**不进成片** |
| `voiceover-report.json` | 每章目标语速、实际语速、时间伸缩量、警告、输出清单 |
| `recording-report.json` | 真人录音检查报告（录完才会生成） |
| `sample-analysis.json` | 人声样音分析报告（给了样音才会生成） |

## 重建 / 使用

```bash
python -m pip install edge-tts numpy soundfile
python tools/build-voiceover.py --episode episodes/2026-11-11-handdrawn-beat-video-kit

# 给一段人声样音（例如 67 字），测语速并给逐章建议字数
python tools/check-recording.py --episode episodes/2026-11-11-handdrawn-beat-video-kit \
  --take ~/sample.wav --sample --chars 67

# 录完整条后检查，再一键替换音轨出片
python tools/check-recording.py --episode episodes/2026-11-11-handdrawn-beat-video-kit --take ~/my-voice.wav
python tools/check-recording.py --episode episodes/2026-11-11-handdrawn-beat-video-kit --take ~/my-voice.wav --mux
```

试看版成片在 `out/*-reference-vo.mp4`（视频流 copy，画面与交付成片逐帧一致，仅音轨换成示范朗读）。

## 边界

参考音是**节奏标尺**，不是成片配音，也不是你的声音。本项目不提供声音克隆；把一段样音扩写成整段同音色旁白，
需要本地部署 GPT-SoVITS / CosyVoice / fish-speech 一类模型及权重。详见 `docs/08-音频与配音.md`。
