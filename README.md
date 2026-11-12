# video-kit-h

一支**手绘口播 / 讲解视频的生产线 + 归档标准**。

一句话：**一个 `episode.json` 同时是旁白稿、分镜表和参数表**，由它生成 16:9 与 9:16 两支成片、旁白稿、时间码、验收报告和一份永久留痕的 `manifest.json`。以后做新的口播稿（产品讲解、方法论、复盘、教程……）都按这套流程走，每支片子与记录各自归档。

本项目与 `handdrawn-beat-video-kit` 是**两个独立仓库**：那边是"换音频做音乐卡点动画"的模板；这边是"写稿子做讲解片"的生产线。渲染内核 fork 自那边，额外加了中文手写字体、竖屏信息图、字幕带分格与归档工具链。**讲解片相关文件不推到那个仓库。**

---

## 先看首期

`episodes/2026-11-11-handdrawn-beat-video-kit/` — 《怎么用 AI 出一份优质的应用动画视频》，240 秒，16:9 与 9:16 两版，7 段旁白 / 10 镜 / 93 张手绘字幕卡。

- `narration-script.md` — **给人录的讲解稿**（7 段逐字正文 + 时间码 + 画面提示 + 语速）
- `narration-cues.json` / `narration.srt` — 剪辑软件对轨用
- `voice/reference-vo.mp3` — **AI 示范朗读**，240 秒逐章贴合时间窗，录之前听语速与停顿用；`voice/segments/01..07.mp3` 是逐段文件、`voice/click-track.mp3` 是 90 BPM 录制导引
- `out/*-reference-vo.mp4` — 把示范朗读换进画面的试看版（视频流 copy，原成片不动）
- `out/explainer-240s-16x9.mp4` / `out/explainer-240s-9x16.mp4` — 两支交付成片（自带 240.000 秒静音 AAC 轨，等后期补录旁白）
- `manifest.json` + `INDEX.md` — 留痕总表

---

## 快速开始

需要 **Node ≥ 20**、**ffmpeg / ffprobe** 在 PATH 上。

```bash
npm install
npm run check                         # 环境 + 仓库自检
node tools/build-episode.mjs --episode episodes/2026-11-11-handdrawn-beat-video-kit
node src/main.mjs --config episodes/2026-11-11-handdrawn-beat-video-kit/project.json --render
node src/main.mjs --config episodes/2026-11-11-handdrawn-beat-video-kit/project-9x16.json --render
```

仓库已提交全部 `generated/` 数据，所以**什么都不准备也能直接渲染**；缺音频时会自动补一条等长静音轨。

## 标准流程（以后每支片子都按这个走）

| 步 | 命令 | 产物 |
|---|---|---|
| 1 建期次 | `node tools/new-episode.mjs --slug 2026-12-01-xxx --title "..." --duration 210` | `episodes/<slug>/` 骨架 |
| 2 写稿 | 编辑 `episode.json`（章节正文 / 分镜 / 元素）与 `anchors.lrc`（画面内要点时间码） | 唯一数据源 |
| 3 编译 | `node tools/build-episode.mjs --episode episodes/<slug>` | 两版 spec / cards / grid、旁白稿、cue、SRT、两份 project.json |
| 4 渲染 | `node src/main.mjs --config episodes/<slug>/project.json --render` 与 `project-9x16.json` | 两版 MP4 |
| 5 验收 | `node tools/verify.mjs --config ... --file ... --report .../verify-report-16x9.json`（两版）<br>`node tools/verify-delivery.mjs --episode ...` | 26 项通用 + 交付专项 |
| 6 音频 | `python tools/build-voiceover.py --episode ...`（出参考音 + 点击轨）<br>录完 `python tools/check-recording.py --episode ... --take <录音> --mux` | 参考音、分段音频、试看版、`*-voiced.mp4` |
| 7 归档 | `node tools/archive-episode.mjs --episode episodes/<slug>` | 联系表、`manifest.json`、刷新 `INDEX.md` |

`npm run episode:new / :build / :render / :verify / :delivery / :archive -- --episode ...` 是同样命令的简写；音频用 `npm run voice:reference -- --episode ...` / `npm run voice:check -- --episode ... --take ...`。

> 音频支线是可选的：不装 Python 依赖、不联网，也能按原流程出无声成片。`python -m pip install edge-tts numpy soundfile` 一次即可启用，详见 `docs/08-音频与配音.md`。

---

## 封面与发布（可选）

`tools/make-cover.mjs` 用本片自己的手绘内核重渲一帧（关掉片内字幕），叠手绘标题带、数字钩子与集数印章，一次输出 **1080×1920** 与 **1080×1440（3:4 主页裁切）** 两张 PNG：

```bash
node tools/make-cover.mjs --engine ./src/render.mjs --kind explainer \
  --config episodes/<slug>/project-9x16.json --time 5 --out out/cover.png
```

`--kind music` 用片中帧底图，`--kind explainer` 用封面专用构图（整页信息图不适合直接当封面）。所有文字限制在 `x≤856 / y 252–840`，避开抖音右侧点赞栏与底部文案区。发布文案规范与安全区细节见 `docs/09-封面与发布.md`。

---

## 每期归档结构（留痕标准）

```
episodes/<slug>/
├── episode.json            稿子 + 分镜 + 参数 + 如实说明（唯一源）
├── anchors.lrc             画面内手绘文字时间码
├── narration-script.md     给人录的稿子
├── narration-cues.json     章节时间码 / 字数 / 语速
├── narration.srt           剪辑软件用
├── project.json            16:9 渲染配置
├── project-9x16.json       9:16 渲染配置
├── generated/              16:9 规格 / 字幕卡 / 节拍网格 / 自检报告
├── generated-9x16/         9:16 同上一套（字号与字幕带格位另算）
├── voice/                  AI 参考音 / 逐段音频 / 点击轨 / 语音报告（wav、mp3 不进 Git，json 入库）
├── out/                    两版成片、试看版、联系表、验收报告（大文件不进 Git）
├── manifest.json           留痕：SHA-256、ffprobe 事实、验收结果、复现命令、未完成项
└── README.md               本期概览
```

`INDEX.md` 由归档脚本自动刷新，汇总所有期次、画幅、验收状态与 manifest 链接。**成片不进 Git**（体积大、可能含授权音频），但 manifest 里留了哈希和 ffprobe 事实，本地 `out/` 保留原件。

---

## 能力边界（重要，别误会）

- **能自动**：时长、BPM 网格、章节时间码、字幕卡拆分、切镜、转场、色彩弧、16:9 与 9:16 两套排版、验收与归档。
- **需要人决定**：每一镜讲什么、用哪张信息图、画面内写哪些要点、旁白正文、以及"画面与新稿子的语义对应"。`shots[].elements` 是可组合的通用信息图组件，不是按稿子自动长出来的插画。
- **9:16 是重新取景 + 竖版重排**，不是裁切或拉伸；竖屏信息图在 `src/props/portrait.mjs`，与横屏共用同一套笔触、色板和 12 次/秒沸腾线条。
- **配音由人录**。成片自带精确等长静音轨，按时间码替换即可；画面内文字已烧进画面，不需要再叠字幕。
- **有可选的 AI 参考音，但没有声音克隆**：`build-voiceover.py` 用在线 TTS 出一条示范朗读，只是录制前的节奏标尺，不是成片配音；把一小段人声扩写成整段同音色旁白需要本地部署克隆模型，本项目不含。样音仍可用于测语速、重算稿件字数与对轨，见 `docs/08-音频与配音.md`。
- 本仓库**不含任何第三方音频**；参考音由在线服务临时合成、不入库；若你换成自己的音乐或配音，授权自行确认。
- 验收是机检 + 抽帧目视，**不等于全片连续试看试听**；这一点会写进每期 manifest 的 `notes.honesty`。

---

## 目录

```
src/core/        数学 / 墨线 / 水彩 / 色板 / 相机 / 画幅 / 字体 / 配置
src/world/       纸底与颗粒
src/characters/  陶土色方块主角（关键视角切换，非 3D 旋转）
src/props/       数字组 / 现实组 / 横版信息图 / 竖版信息图
src/fx/          11 类转场、主角交互层
src/timeline/    读 generated/spec.json 的纯数据时间轴 + 道具调度
src/subtitles.mjs  12 形态 / 12 位置 / 12 出入场 / 4 质感
src/render.mjs   唯一逐帧入口，纯函数 (frame, config) -> 画面
tools/           编译、渲染 CLI、验收、归档、自检 + 两个 Python 音频工具
docs/            标准流程 / 稿子规范 / 配置 / 归档 / 风格 / 版权 / FAQ / 音频与配音 / 封面与发布
episodes/        每期一个目录，永久留痕
```

## 许可

代码与文档为 MIT（见 `LICENSE`）。仓库内的示例、稿子与占位静音轨不含第三方素材；你放入的音频、字体与配音的授权由你自行负责，见 `docs/06-版权与授权.md`。
