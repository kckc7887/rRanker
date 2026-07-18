# rRanker Demo 经验总结

> `demo/` 是本地概念验证归档区。除本文件外，目录已加入 `.gitignore`，不属于正式产品代码，也不应成为 Android/iOS 客户端的运行时依赖。

## 1. 归档内容

| 目录 / 方向 | 验证目标 | 已确认结果 | 当前结论 |
| --- | --- | --- | --- |
| `diving-fish-demo/` | 水鱼公开接口与数据格式 | 曲库、谱面统计可读；玩家查询需要有效参数/身份 | 可作为 provider 与 fixture 来源，不能假定接口长期稳定 |
| `wechat-crawler-demo/` | 华立微信公众号成绩抓取 | 成功取得玩家信息及 697 条成绩，fc/fs/rate 可用 | 证明数据链路可行；PC 代理方案不能直接移植到移动端 |
| `wechat-oauth-paste-demo/` | 无 VPN「用户粘贴回调」授权回传 | GUI：生成微信打开链接 + 粘贴；探针仅玩家名 | PC 粘贴可用；手机最终链接 code 已废 |
| `local-capture-service/` | 接到未消费 callback 后的处理程序 | `:18765` 收四参数 → 换 cookie → 玩家名；mitm 插件自动 POST | Clash/mitm 正式后链路 |
| `local-capture-service/` | 截到未消费 callback **之后**的处理程序 | HTTP `:18765` 接收四参数 → maimai_py 换 cookie → 玩家名；mitm 插件自动 POST 并短路微信 | 与 Clash/mitm 配合的正式截包后链路 |
| `wechat-crawler-demo/rranker_wechat_demo.go` | 单 EXE、本地 UI、代理与抓取整合 | 证明可以把验证流程封装成单程序 | 只保留实现参考，不发展桌面客户端 |
| `webui-proxy-demo/` | Python WebUI、状态机、代理恢复与打包 | 前后端契约和清理路径已设计，部分仅静态验证 | 适合提取状态机经验，不复用为正式客户端架构 |
| 已删除的 LXNS POC | 落雪曲库与收藏品接口 | 公共读取曾返回完整曲库；开发者 API 门槛较高 | 暂不作为主数据源，重新接入前必须重新核验 |
| `score-hub-friendcode-demo/` | 仅好友码经 score-hub 公网 API 登录并拉 latest sync | 本地 Demo：Bot 好友登录 + 单次 update_score + 慢轮询 | 不进产品；勿对公网 API 批量压测 |
| `phigros-resource-publisher/` | 最新客户端探测、解包、整理与对象存储发布 | 最新下载地址返回 HTTP 200；参考 APK 整理出 1027 个文件（约 779 MiB） | 本地 WebUI 已可用；真实对象存储上传留待用户使用自有凭据验证 |

## 2. 水鱼数据源 POC

### 验证过的内容

- `/music_data` 曾返回 1350 首曲目。
- `/chart_stats` 曾返回 1350 首歌曲、6750 个谱面统计。
- `/query/player` 缺少 username/qqid 时返回 400，说明玩家查询不能按公开无参接口使用。
- 曲目与谱面字段可支撑 `Song`、`Chart`、拟合定数和统计分布模型。
- `divingfish_demo.json` 中保存过真实玩家快照，可用于本地 schema 研究。

### 可复用经验

- 页面不应直接消费上游 JSON；先校验，再转换为统一领域模型。
- 原始 song id 需要保留，避免 SD、DX、宴会场映射后无法追溯。
- HTTP 200 只代表当次探测成功，不代表认证、限流、许可或长期稳定性已经确认。
- 真实玩家快照进入正式 `fixtures/` 前必须脱敏，token、cookie、好友码不得提交。

## 3. 微信公众号抓取 POC

### 已验证链路

1. 启动 mitmproxy，生成微信 OAuth URL。
2. 捕获 `tgk-wcaime.wahlap.com` 回调中的 `r/t/code/state`。
3. 使用回调参数换取 cookies。
4. 并行抓取五个难度页面并解析成绩。
5. 输出玩家信息与标准化成绩 JSON。

一次真实结果为 697 条成绩：fc 有值 213 条、fs 有值 578 条、rate 有值 697 条。`play_time` 全部缺失，因为 genre 搜索页本身不提供该字段，需要另外的 record 页面。

### Windows 特有问题

- PC 微信内置浏览器不遵循普通系统代理，因此最终使用 mitmproxy `--mode local` 的 WFP 拦截。
- `block_global=false` 曾导致全量 502；非目标请求处理不当也会让微信页面显示 502。
- WFP 模式下出现过 WinError 121，核心抓取仍可完成，但说明方案对环境敏感。
- Windows 控制台 GBK 无法稳定打印非 ASCII 日志，验证阶段改用英文日志规避编码异常。

### 产品化结论

- 这套流程只证明“数据能拿到”，不证明 Android/iOS 可以采用相同方法。
- 移动端必须分别验证授权、Cookie、外部浏览器返回、后台切换和安全存储。
- 正式接入优先级仍是：许可明确的 provider API → 用户主动提供 token/文件 → 明确不支持。
- 不把安装 CA、修改系统代理或中间人拦截作为移动客户端的默认前置条件。

## 4. WebUI 与单程序封装 POC

### 有价值的设计

- 状态机应显式区分 `idle`、`proxy_starting`、`waiting_oauth`、`crawling`、`done`、`error`。
- addon 与主程序用 `state.json` / `result.json` 通信，比解析控制台日志稳定。
- 启动、中止、异常和进程退出都必须走同一清理逻辑。
- 临时目录应在结果读入内存后删除；重置操作必须清空状态和残留进程。
- 打包程序读取资源时需要兼容源码目录与 PyInstaller `_MEIPASS`。
- 错误态必须允许用户重试，不能让前后端状态约束把页面卡死。

### 没有完成的验证

- WebUI 主流程主要完成了静态、语法和字段契约验证，没有完整端到端回归。
- `proxy_manager` 没有在验证时真实写入注册表，避免破坏当前系统代理。
- PyInstaller spec 通过静态检查，但没有在完整依赖环境中真正产出并运行 EXE。
- 因此这些代码只能作为 PoC，不能标记为生产可用。

## 5. 数据与展示映射经验

### 成绩字段

- 核心字段：`song_id`、`title`、`type`、`level`、`level_index`、`achievements`、`dx_score`、`dx_rating/ra`、`fc`、`fs`、`rate`。
- `fc`、`fs` 允许为空；空值应隐藏或明确显示未知，不能伪造普通完成状态。
- 未知枚举应保留原文并降级显示，不能静默丢弃整条成绩。
- achievements 的单位和精度必须由 provider adapter 统一，避免不同来源重复除以或乘以 100。

### 封面 ID 映射

WebUI 曾使用以下水鱼 song id → 落雪封面 id 规则：

- `>= 110000`：减 `110000`（宴会场 DX）。
- `>= 100000`：减 `100000`（宴会场 SD）。
- `10001..19999`：减 `10000`（DX）。
- 其他：保留原值（SD）。

该规则解决过宴会场封面 404，但只应作为历史映射测试样例；重新接入 CDN 前需要重新验证 ID 规则和使用许可。

### 页面经验

- 封面加载失败必须有稳定占位，不能让卡片塌陷。
- 长歌名、日文标题、空 artist 与 600+ 条成绩必须单独测试。
- B35/B15 不能只按全量 RA 排序模拟，必须有可信的歌曲版本字段。
- 被撤回的概念页说明：真实数据不等于有效设计。正式 UI 应先由产品设计确定信息层级和视觉方向，再实现组件。

## 6. 落雪 POC 的结论

- `song/list?notes=true` 曾返回 1294 首曲目，按 `standard` / `dx` 分类难度。
- `trophy/list` 曾返回 2990 个收藏品。
- song id 与 NET id 存在 `% 10000` 关系，但宴会场等边界需要额外映射。
- 因开发者 API 门槛与项目阶段原因，落雪支持已撤回；历史成功响应不能作为当前 API 可用性的证据。

## 7. 后续正确复用方式

1. 从两个 JSON 输出中挑选最小样例，脱敏后放入正式 `fixtures/`。
2. 为每个来源建立 schema、adapter 和错误样例，不直接复制 Demo 请求代码进页面。
3. 用 fixture 对照测试 Rating、B35/B15、排序、fc/fs/rate 与 ID 映射。
4. 在 Android 和 iPhone 真机上重新验证数据接入，不复用电脑端代理假设。
5. 只有通过真机、异常路径、隐私和许可检查的能力，才进入 `apps/mobile`。

## 8. Phigros 资源发布 POC

### 已验证链路

1. 按参考插件使用的 TapTap 接口解析 Phigros 最新版本与 APK 地址。
2. 对 APK 地址发起流式请求，收到 HTTP 200 即结束下载测试，不落盘最新 APK。
3. 从 `refer/astrbot_plugin_phi.zip` 提取已有 APK 与解包工具链。
4. 调用参考项目解包逻辑，整理头像、原图、模糊图、低清图和元数据。
5. 生成带 SHA-256 的 `manifest.json`、资源索引 `catalog.json` 和入口 `current.json`。

参考 APK `3.19.0.1` 的一次真实整理结果为 1027 个资源文件、816681939 字节。上传开关默认关闭，Access Key 与 Secret Key 只随 localhost 请求进入内存，不写入配置或日志；雨云 S3 兼容上传未代替用户执行。

### 发布约束

- 服务范围仅是最新版 Phigros 解包资源，不存储玩家数据，也不包含应用账号系统。
- 客户端应先请求 `current.json`，再按版本路径读取资源；发布时最后覆盖该入口文件。
- 仅在用户明确勾选后上传；旧版本清理也需要独立确认，并限制在 `phigros/releases/` 前缀。
- 上游接口、资源再分发许可、对象存储费用和流量保护仍需持续核验。

## 9. 归档规则

- 新的临时 POC 统一放在 `demo/<主题>/`，不要再占用仓库顶层。
- Demo 必须记录目标、环境、输入、输出、已验证项、未验证项和结论。
- 有价值的结论写回本文件或正式文档；有价值的样例先脱敏再移入 `fixtures/`。
- Demo 代码、真实输出、构建产物和凭据都不提交。
- 若某个 Demo 升级为正式实现，应重新建立受跟踪目录，而不是取消整个 `demo/` 的忽略规则。
