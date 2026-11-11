# 2026-11-11-handdrawn-beat-video-kit · 怎么用 AI 出一份优质的应用动画视频

- 日期：2026-11-11　主题：方法论口播 / 手绘动画讲解　标签：手绘动画 / 卡点 / 提示词规格化 / 逐帧验收 / 工作流
- 时长：240.000 s @ 24 fps = 5760 帧；90 BPM，首拍 0.4 s
- 章节：7 段 / 分镜：10 镜 / 画面锚点：31 条
- 旁白：952 字，语速 223 / 219 / 277 / 213 / 227 / 274 / 205 字每分

## 交付物

| 文件 | 说明 |
|---|---|
| `episode.json` | 稿子 + 分镜 + 参数的唯一源 |
| `anchors.lrc` | 画面内手绘文字的时间码 |
| `narration-script.md` | 给人录的旁白稿（含时间码与画面提示） |
| `narration-cues.json` / `narration.srt` | 剪辑软件对轨用 |
| `project.json` / `project-9x16.json` | 两版渲染配置 |
| `generated/` `generated-9x16/` | 规格、字幕卡、网格、自检报告 |
| `out/` | 两版成片、联系表、验收报告（大文件不入库） |
| `manifest.json` | 留痕：哈希、参数、验收、未完成项 |

## 复现

```bash
node tools/build-episode.mjs --episode episodes/2026-11-11-handdrawn-beat-video-kit
node src/main.mjs --config episodes/2026-11-11-handdrawn-beat-video-kit/project.json --render
node src/main.mjs --config episodes/2026-11-11-handdrawn-beat-video-kit/project-9x16.json --render
node tools/verify.mjs --config episodes/2026-11-11-handdrawn-beat-video-kit/project.json --file episodes/2026-11-11-handdrawn-beat-video-kit/out/explainer-240s-16x9.mp4
node tools/verify.mjs --config episodes/2026-11-11-handdrawn-beat-video-kit/project-9x16.json --file episodes/2026-11-11-handdrawn-beat-video-kit/out/explainer-240s-9x16.mp4
node tools/archive-episode.mjs --episode episodes/2026-11-11-handdrawn-beat-video-kit
```

## 如实说明

- 只做了抽帧目视与机检，未做全片连续试看试听；旁白由用户后期补录
- 由 handdrawn-beat-video-kit 音乐卡点动画工程拆解而来，讲解片本身不含任何第三方音频
