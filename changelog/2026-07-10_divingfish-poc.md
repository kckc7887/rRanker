# 2026-07-10 水鱼数据源 POC

## 改动原因
验证水鱼 (DivingFish) 公开 API 的可用性和数据格式。

## 具体实现
- 创建 `diving-fish-demo/`
- `divingfish_demo.py`: 纯标准库（urllib），无额外依赖
- 验证 3 个端点：

| 端点 | 方法 | 结果 |
|------|------|------|
| `/music_data` | GET | 200, 1350 首曲目 |
| `/chart_stats` | GET | 200, 1350 首歌曲, 6750 个谱面 |
| `/query/player` | POST | 400（需 username/qqid，预期行为） |

- 输出 `divingfish_demo.json`（含 music_data 示例）

### 关键发现
- `music_data` 返回数组：`[{id, title, charts: [{difficulty, dx_rating, ...}]}]`
- `chart_stats` 返回 `{"charts": {songId: [{cnt, diff, fit_diff, avg, avg_dx, std_dev, dist, fc_dist}]}}`
- 歌曲 ID 直接用 NET musicId（DX 谱面 > 10000）

## 期望输出
所有公开端点返回 200，数据格式与 api-protocol.md 一致。

## 实际输出
与期望一致。`/query/player` 需认证参数，400 符合预期。
