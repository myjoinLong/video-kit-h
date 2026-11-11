# 贡献

欢迎提 issue / PR。这是个"数据驱动"的仓库，请尽量**改数据而不是改渲染代码**。

## 提交前

```bash
npm install
npm run check                                        # 语法 / 路径 / 依赖 / 期次完整性
node tools/build-episode.mjs --episode episodes/<slug>   # 断言必须 clean
node tools/verify-delivery.mjs --episode episodes/<slug>
node tools/archive-episode.mjs --episode episodes/<slug>
```

## 三条原则

1. **一个 `episode.json` 是唯一源**。旁白、分镜、参数都写在这里；两份 `project.json` 和 `generated/` 由编译器生成，PR 里请连同生成物一起提交（保证 clone 即可渲染）。
2. **纯函数**：所有绘制函数 `(g, t, o) => void`，同一 `t` 必须得到同一帧。禁止 `Math.random`、跨帧状态、计数器。
3. **风格不放松**：13 色锁定色板、无纯黑纯白、墨线 12 次/秒沸腾、严格平面 2D、无 UI 截图 / 图标字体 / 渐变光效。

## 加新能力

- 新信息图：`src/props/explainer.mjs`（横版）+ `src/props/portrait.mjs`（竖版）+ 在 `src/timeline/props.mjs` 注册名字，见 `docs/03`
- 新转场：`src/fx/transitions.mjs`，并在 `build-episode.mjs` 的 `TRANSITIONS` 生成逻辑里可用
- 新期次：`npm run episode:new -- --slug ...`，按 `docs/01` 走完六步再归档

## 不要提交

- 成片 MP4、临时 WAV、`node_modules/`（`.gitignore` 已排除）
- 任何你无权分发的字体 / 音频 / 图片
- 机器绝对路径、专有曲目名（`npm run check` 会拦）

## 如实说明

每期 `episode.json` 的 `notes.honesty` 必填：哪些没做、哪些人工确认、授权状态。这条不是形式主义，它会进 `manifest.json` 永久留痕。
