# webui-proxy-demo 成绩卡片化 + 重置按钮 + idle 提示

## 改动原因
原 `index.html` done 态用表格展示成绩，信息密集且无封面/RA/artist。需要：
1. idle 态补充首次使用提示（证书、管理员权限、微信 502 现象）。
2. 成绩从表格改为卡片列，含封面图、难度色标、RA。
3. done 态提供蓝色「重置」按钮，调用 `POST /api/reset` 回到 idle。
4. 异步请求 `GET /api/songs` 用落雪曲库补全 artist。
5. FC/FS/Rate 改为带色徽章，无值不显示。

## 具体实现
修改 `webui-proxy-demo/index.html`（单文件，内联 CSS/JS，无外部依赖）：

### CSS 新增（插入 `.dash` 与 `@media` 之间）
- `.score-list`：成绩卡片滚动容器，max-height 60vh，紫色滚动条。
- `.score-card`：flex 行，`var(--bg-card)` 背景，圆角 8px，padding 12px，margin-bottom 8px，hover 变 `--bg-card-2`。
- `.card-cover`：80×80px，圆角 4px，object-fit cover，背景 `--bg-card-2`（图加载失败时作占位灰框）。
- `.card-info`：右侧 flex 列，gap 4px。
- `.card-title-row` / `.card-title`：歌名 16px 粗体，ellipsis 截断。
- `.diff-tag` + `.diff-tag-0..4`：难度带色背景标签，舞萌 DX 标准色（BAS #22bb5c / ADV #ffb800 / EXP #ff5c5c / MAS #cc66ff / Re:MAS #ffaa00），黄/金底用深色字。
- `.card-artist`：13px 灰色小字，ellipsis。
- `.card-stats`：达成率/DX分/RA 横排，`.ra` 紫色高亮。
- `.card-tags` + `.badge` / `.badge-fc` / `.badge-fs` / `.badge-rate`：小徽章，带色背景。
- `.btn-reset`：蓝色渐变（#2196f3→#1976d2），与紫色开始按钮区分。
- `.idle-tips`：居中、12px、灰色、line-height 1.8。

### HTML
- 操作区新增 `<button id="reset-btn" class="btn btn-reset" hidden>重置</button>`。

### JS
- 新增 `resetBtn` 引用。
- 新增工具函数：
  - `lxnsId(songId)`：落雪 song_id → 封面 lxns_id（≥110000 减 110000 / ≥100000 减 100000 / ≥10001 减 10000 / 其余原值）。
  - `diffTag(li)`：返回带色难度标签 HTML，无值返回空。
  - `badgeOrEmpty(v, cls)`：FC/FS/Rate 徽章，复用 upperOrDash 的末尾 p→+ 逻辑，无值返回空字符串。
  - `fmtRA(v)`：dx_rating/100 保留一位小数，无值返回空。
- 新增 `resetFlow()`：`POST /api/reset` 后 `startPolling()`，catch 也回退轮询。
- `renderIdle()`：隐藏 reset，追加 `.idle-tips` 三行提示。
- `renderProxyStarting` / `renderWaitingOauth` / `renderCrawling` / `renderError`：均隐藏 reset。
- `renderDone()` 重写：
  - 不再隐藏 actionsArea，显示 reset 按钮，隐藏 start/stop。
  - 成绩渲染为 `.score-card` 列表（封面 + 歌名 + 难度标签 + artist + 达成率/DX分/RA + FC/FS/Rate 徽章）。
  - 封面 URL `https://assets2.lxns.net/maimai/jacket/{lxns_id}.png`，`onerror` 设 `visibility:hidden` 露出灰色背景占位。
  - 卡片根节点带 `data-song-id`。
  - 末尾 `resetBtn.onclick = resetFlow` 绑定。
  - 异步 `GET /api/songs`，按 `data-song-id` 匹配更新 `.card-artist`，catch 静默。

## 期望输出
- idle 态按钮下方出现三行灰色小字提示。
- done 态成绩以卡片列展示，每张含封面/歌名/难度色标/artist/达成率/DX分/RA/FC/FS/Rate 徽章；封面失败显示灰框。
- done 态显示蓝色「重置」按钮，点击后请求 `/api/reset` 并恢复轮询回到 idle。
- 曲库接口可用时 artist 自动补全，不可用时卡片仍正常展示（artist 留空）。

## 实际输出
- 已修改 `webui-proxy-demo/index.html`，CSS/HTML/JS 全部内联，无外部依赖。
- 前端字段（song_id/title/level_index/achievements/dx_score/dx_rating/fc/fs/rate/artist）与 server.py 现有 `_lxns_songs`（str(song_id)→{title,artist}）映射一致。
- `/api/songs` 与 `/api/reset` 后端路由尚未实现，前端均带 `.catch` 容错：曲库请求失败静默、重置请求失败回退轮询，不阻塞主流程。
- 未运行浏览器实测（单文件静态页），代码已逐段复核：难度色值、lxnsId 三级区间、onerror 占位、徽章空值隐藏均符合预期。
