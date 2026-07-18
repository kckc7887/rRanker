# LXNS 收藏品原始数据快照

- 下载时间：2026-07-19 00:47（Asia/Shanghai）
- API 基址：`https://maimai.lxns.net/api/v0/maimai`
- 请求参数：四类列表均使用 `required=true`
- 文件内容：保留接口原始 JSON 响应，不做格式化或字段改写

| 文件 | 端点 | 顶层数组 | 数量 | SHA-256 |
|---|---|---|---:|---|
| `trophy.json` | `/trophy/list?required=true` | `trophies` | 2990 | `7CB861FD50559A098804214AA25A29429F8B9701589D2763F5CCDA8DE8D93316` |
| `icon.json` | `/icon/list?required=true` | `icons` | 1041 | `40363634FF845C01FA8290F572FF3A0C5EFCD7A3B07E2F41B280F00641D6116E` |
| `plate.json` | `/plate/list?required=true` | `plates` | 397 | `2C0A370F81B44BA2DB53716190FE309F1386D8177951C965FF8A093EFA4957FF` |
| `frame.json` | `/frame/list?required=true` | `frames` | 343 | `3479542630AF23A9A33B18A4152F3E8243E5EBB7B709C1A1C6EF63C23A197C17` |

分析结论见 [`docs/lxns-collection-condition-analysis.md`](../../docs/lxns-collection-condition-analysis.md)。该快照只代表下载时的公共 API 状态，上游新增或修正收藏品后数量和哈希会变化。
