# Changelog

## 1.0.0 — 独立生产线首发

从 `handdrawn-beat-video-kit`（音乐卡点动画模板）拆出口播 / 讲解视频生产线，成为独立仓库；讲解片相关文件不再推往那个仓库。

**生产线**
- `tools/new-episode.mjs`：一键建期次骨架（稿子 + 分镜占位 + 两版画幅配置）
- `tools/build-episode.mjs`：`episode.json` + `anchors.lrc` → 两版 spec / 字幕卡 / 节拍网格、旁白稿 / cues / SRT、两份 project.json；内置章节连续性、语速、锚点、转场、缩放断言
- `tools/verify.mjs` / `verify-delivery.mjs`：26 项通用判据 + 两版交付专项（含静音轨与稿子三件套）
- `tools/archive-episode.mjs`：从成片抽 10 镜联系表、写 `manifest.json`（SHA-256 / ffprobe / 验收 / 复现命令 / 如实说明）、刷新 `INDEX.md`
- `tools/selfcheck.mjs`：语法、机器路径、第三方素材、期次完整性、索引同步

**画面**
- 保留原手绘内核：纸纹、12 次/秒沸腾墨线、13 色锁定色板、平面 2D、11 类转场、主角交互
- 新增 `src/props/portrait.mjs`：10 张**竖版重新排版**的信息图（不是裁切或拉伸）
- 新增 `src/core/font.mjs`：拉丁手写 + 中文楷体跨平台探测
- 字幕带支持 3 列网格（按真实同屏顺序分格）、竖屏字号倍率、尾卡独占中央

**首期归档**
- `episodes/2026-11-11-handdrawn-beat-video-kit/`：240.000 s / 24 fps / 5760 帧 / 7 章 / 10 镜 / 31 条画面锚点 → 93 张手绘分卡
- 16:9 成片为已交付原文件（哈希一致，数据逐字节一致，横屏渲染路径未改）；9:16 为全新渲染
- 两版各 26/26 通用验收 + 交付专项全过
- 旁白由用户后期补录，成片内嵌精确等长静音 AAC 轨
