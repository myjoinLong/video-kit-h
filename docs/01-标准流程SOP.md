# 01 · 标准流程 SOP

> 每支片子都走同一条流水线。中途不手写渲染代码，不改内核；只改数据。

## 七步

### 1. 建期次

```bash
node tools/new-episode.mjs --slug 2026-12-01-product-launch \
  --title "新产品讲解" --duration 210 --chapters 6 --shots 8 --bpm 90
```

生成 `episodes/<slug>/` 骨架：`episode.json`、`anchors.lrc`、`README.md`、`out/`。
`--chapters` 与 `--shots` 只是等分占位，随后按内容改成真实边界。

### 2. 写稿（唯一人工创作步骤）

编辑 `episode.json`：

- `chapters[].narration`：真正的口播正文；`in/out` 必须首尾相接、覆盖 `0 → duration`
- `chapters[].screen`：这一段观众看到什么，写进给主播的稿子里
- `shots[]`：每镜 `a/b/scene/cam/elements/arc/transition`，边界同样连续覆盖全片
- `notes.honesty`：没做的事、需人工确认的事，如实写（会进 manifest）

编辑 `anchors.lrc`：画面内手绘要点的时间码。一行一条，格式 `[mm:ss.xxx]文字`。
建议每 6–10 秒一条，短句（4–12 字），编译器会拆成 2–3 张分卡。

**这一步的验收点**：`node tools/build-episode.mjs` 会检查章节/分镜时间连续、语速 120–300 字/分、锚点 ≥ 8 条、转场数 = 镜数 + 1、缩放 ≤ 1.14。不通过会直接报错，不会生成半成品。

### 3. 编译数据

```bash
node tools/build-episode.mjs --episode episodes/<slug>
```

一次产出：两版 `spec.json` / `subtitle-cards.json` / `beat-grid.json` / `prepare-report.json`、
`project.json` / `project-9x16.json`、`narration-script.md` / `narration-cues.json` / `narration.srt`、本期 `README.md`。

9:16 的字幕卡会额外写入 `bandCol/bandRow`（按真实同屏顺序分格），并按 `kfScale` 收字号。

### 4. 渲染两支成片

```bash
node src/main.mjs --config episodes/<slug>/project.json --render
node src/main.mjs --config episodes/<slug>/project-9x16.json --render
```

9:16 的输出名由渲染器自动加 `-9x16` 后缀，不要手动改。
先出几张静帧目视：`node src/main.mjs --config ... --stills 5,25,68,158,205,239` → `out/stills[-9x16]/`。

**正式渲染前必须看静帧**：确认标题不被卡压住、信息图不空、竖屏无裁切、片尾是渐次收束。

### 5. 验收

```bash
node tools/verify.mjs --config episodes/<slug>/project.json \
  --file episodes/<slug>/out/<name>-16x9.mp4 \
  --report episodes/<slug>/out/verify-report-16x9.json
node tools/verify.mjs --config episodes/<slug>/project-9x16.json \
  --file episodes/<slug>/out/<name>-9x16.mp4 \
  --report episodes/<slug>/out/verify-report-9x16.json
node tools/verify-delivery.mjs --episode episodes/<slug>
```

通用 26 项 + 交付专项（两版成片、静音轨、稿子三件套、语速、验收报告）。
未通过先修数据或排版，**不要带着 ❌ 归档**。

### 6. 音频（参考音 → 录人声 → 替换音轨）

```bash
python -m pip install edge-tts numpy soundfile        # 一次性
python tools/build-voiceover.py --episode episodes/<slug>
```

产出 `voice/reference-vo.mp3`（逐章贴合时间窗的示范朗读）、`voice/segments/01..NN.mp3`、
`voice/click-track.mp3`（90 BPM 导引，不进成片）与 `out/*-reference-vo.mp4` 试看版。
**这一步只帮你听节奏，不是成片配音**；也完全可以跳过，直接录人声。

拿着 `narration-script.md` 逐字录，然后：

```bash
python tools/check-recording.py --episode episodes/<slug> --take ~/my-voice.wav          # 先检查
python tools/check-recording.py --episode episodes/<slug> --take ~/my-voice.wav --mux   # 再出片
```

工具会报时长差、峰值、削波、逐章有声占比，并补齐到 `duration` 精确长度、−16 LUFS 标准化、
替换音轨生成 `*-voiced.mp4`（视频流 copy）。只给了**一小段样音**时加 `--sample --chars <字数>`，
它给出你的真实语速与逐章建议字数——据此回去改 `episode.json` 再编译，时间码就贴合你的说话习惯。

> 声音克隆不在本项目能力内：把样音扩写成整段同音色旁白，需要本地部署 GPT-SoVITS / CosyVoice / fish-speech
> 一类模型及权重。详见 `docs/08-音频与配音.md`。

### 7. 归档留痕

```bash
node tools/archive-episode.mjs --episode episodes/<slug>
```

自动生成两版联系表（从成片解码抽帧）、`manifest.json`（SHA-256 / ffprobe / 验收结果 / 复现命令 / 未完成项），刷新根目录 `INDEX.md`。

## 交付清单（每期）

- [ ] 两版 MP4（本地 `out/`，不入库）
- [ ] `narration-script.md` 给主播（**含逐字正文**），`narration.srt` 给剪辑
- [ ] `voice/reference-vo.mp3` + `voice/click-track.mp3`（如走了音频支线）
- [ ] 若已录人声：`*-voiced.mp4` + `voice/recording-report.json`
- [ ] 两版联系表 + 两份验收报告
- [ ] `manifest.json` + `INDEX.md` 已更新
- [ ] `episode.json` 的 `notes.honesty` 写了未完成项
- [ ] `npm run check` 通过

## 什么情况下才改内核

只有三种：新增一类信息图（在 `src/props/` 加绘制函数并在 `timeline/props.mjs` 注册）、新增一种转场、修 bug。
**换选题、换稿子、换时长、换画幅、换色板权重，都只改数据。**
