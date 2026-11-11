# video-kit-h

一支**手绘口播 / 讲解视频的生产线 + 归档标准**。

一句话：**一个 `episode.json` 同时是旁白稿、分镜表和参数表**，由它生成 16:9 与 9:16 两支成片、旁白稿、时间码、验收报告和一份永久留痕的 `manifest.json`。以后做新的口播稿（产品讲解、方法论、复盘、教程……）都按这套流程走，每支片子与记录各自归档。

本项目与 `handdrawn-beat-video-kit` 是**两个独立仓库**：那边是"换音频做音乐卡点动画"的模板；这边是"写稿子做讲解片"的生产线。渲染内核 fork 自那边，额外加了中文手写字体、竖屏信息图、字幕带分格与归档工具链。**讲解片相关文件不推到那个仓库。**

---

## 先看首期

`episodes/2026-11-11-handdrawn-beat-video-kit/` — 《怎么用 AI 出一份优质的应用动画视频》，240 秒，16:9 与 9:16 两版，7 段旁白 / 10 镜 / 93 张手绘字幕卡。

- `narration-script.md` — **给人录的讲解稿**（含时间码、画面提示、语速）
- `narration-cues.json` / `narration.srt` — 剪辑软件对轨用
- `out/explainer-240s-16x9.mp4` / `out/explainer-240s-9x16.mp4` — 两支成片（自带 240.000 秒静音 AAC 轨，等后期补录旁白）
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
| 6 归档 | `node tools/archive-episode.mjs --episode episodes/<slug>` | 联系表、`manifest.json`、刷新 `INDEX.md` |

`npm run episode:new / :build / :render / :verify / :delivery / :archive -- --episode ...` 是同样命令的简写。

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
├── out/                    两版成片、联系表、验收报告（大文件不进 Git）
├── manifest.json           留痕：SHA-256、ffprobe 事实、验收结果、复现命令、未完成项
└── README.md               本期概览
```

`INDEX.md` 由归档脚本自动刷新，汇总所有期次、画幅、验收状态与 manifest 链接。**成片不进 Git**（体积大、可能含授权音频），但 manifest 里留了哈希和 ffprobe 事实，本地 `out/` 保留原件。

---

## 能力边界（重要，别误会）

- **能自动**：时长、BPM 网格、章节时间码、字幕卡拆分、切镜、转场、色彩弧、16:9 与 9:16 两套排版、验收与归档。
- **需要人决定**：每一镜讲什么、用哪张信息图、画面内写哪些要点、旁白正文、以及"画面与新稿子的语义对应"。`shots[].elements` 是可组合的通用信息图组件，不是按稿子自动长出来的插画。
- **9:16 是重新取景 + 竖版重排**，不是裁切或拉伸；竖屏信息图在 `src/props/portrait.mjs`，与横屏共用同一套笔触、色板和 12 次/秒沸腾线条。
- **不含 TTS**。成片自带精确等长静音轨，旁白由人后期补录后按时间码替换；画面内文字已烧进画面，不需要再叠字幕。
- 本仓库**不含任何第三方音频**；若你换成自己的音乐或配音，授权自行确认。
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
tools/           编译、渲染 CLI、验收、归档、自检
docs/            标准流程 / 稿子规范 / 配置 / 归档 / 风格 / 版权 / FAQ
episodes/        每期一个目录，永久留痕
```

## 许可

代码与文档为 MIT（见 `LICENSE`）。仓库内的示例、稿子与占位静音轨不含第三方素材；你放入的音频、字体与配音的授权由你自行负责，见 `docs/06-版权与授权.md`。
