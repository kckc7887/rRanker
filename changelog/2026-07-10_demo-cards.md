# 2026-07-10 Demo 首页卡片展示

## 改动原因

需要一个 Web Demo 展示曲目封面 + 成绩卡片的交互效果，验证数据链路（LXNS 曲库 + 水鱼成绩）的可行性。

## 具体实现

### 新增文件

- `demo/proxy.py` — Python 代理服务器（纯 stdlib），解决浏览器 CORS 限制
  - 监听 `127.0.0.1:8080`
  - `/api/lxns/*` → 转发到 `maimai.lxns.net`
  - `/api/df/*` → 转发到 `diving-fish.com`，自动附带 Import-Token
  - 同时作为静态文件服务器托管 `index.html`

- `demo/index.html` — 单文件 SPA
  - 启动时并行加载 LXNS `song/list`（曲库）和水鱼 `player/records`（成绩）
  - 曲库缓存到 `sessionStorage`
  - 水鱼 song_id ≥ 10001（DX 曲）→ 减 10000 映射到 LXNS song_id
  - 排序：RA 降序 → song_id 升序
  - 封面图：`https://assets2.lxns.net/maimai/jacket/{lxns_id}.png`
  - 搜索框支持歌名过滤
  - 卡片布局：左侧 90×90 封面 + 右侧歌名/artist/难度/FC/FS/达成率/RA
  - 难度色复用旧项目 SonicRating 色值
  - FC/FS 格式化规则：FC⁺, AP⁺, FS⁺, FDX, FDX⁺, SYNC

### 数据来源

| 数据 | 来源 | endPoint |
|------|------|----------|
| 曲库 | LXNS 公共 API | `/api/v0/maimai/song/list` |
| 封面 | LXNS CDN | `assets2.lxns.net/maimai/jacket/{id}.png` |
| 成绩 | DivingFish | `/player/records` (Import-Token) |

## 启动方式

```bash
cd demo
python proxy.py
```

然后浏览器打开 `http://127.0.0.1:8080`

## 期望输出

- 首页展示所有成绩卡片，按 RA 排序
- 每张卡片显示封面 + 歌名 + artist + 难度色标 + 成绩信息
- 搜索可用，过滤出匹配歌名

## 实际输出

- 代理测试：LXNS 曲库 200 OK (820KB)，水鱼成绩 200 OK (147KB)
- 代理与静态文件均正常返回 200

## 后续修复

### ID 映射修补

水鱼 song_id 有三级区间：1~9999(SD)、10001~19999(DX)、100000~119999(宴会场)。
宴会场曲为 `100000+原id` 或 `110000+原id`，直接减 10000 会得到错误 LXNS ID 导致封面 404。

修正 `getLxnsId` 逻辑：
- ≥110000 → 减 110000（宴-DX）
- ≥100000 → 减 100000（宴-SD）
- 10001~19999 → 减 10000（DX）
- 其余原值（SD）

经验证 5 个宴会场 ID 全部修复为 200。
