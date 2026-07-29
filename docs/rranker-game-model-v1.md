# rranker-game-model/v1 统一游戏数据契约

## 目标

`rranker-game-model/v1` 是 rRanker 三个游戏页面使用的应用层 JSON 契约。上游查分器载荷和原始曲库缓存保持原样，由游戏适配器转换成统一文档；总览、最佳、成绩、曲库和歌曲详情只读取本契约，不判断具体游戏。

契约分为两个独立、可完整 JSON 序列化的文件：

- `GameManifestV1`：静态能力与展示定义，包括标签、样式、页面槽位、筛选器、动作和资源解析器。
- `GameDataDocumentV1`：动态账号、歌曲、谱面、成绩、最佳栏目和来源状态。

运行时先分别执行 Zod 严格校验，再执行 Manifest/Document 交叉引用校验。开发和测试环境直接报告错误；生产环境展示“游戏配置不可用”。

## Manifest

### 标签组

`tagGroups[]` 使用 `role` 判别联合：

- `difficulty-axis`：必须且只能有一个；声明 `valueSeparator` 和曲库简化显示。
- `type-axis`：可选且最多一个；用于同一歌曲的 SD、DX、U·TA·GE 等谱面类型。
- `attribute`：普通属性，必须声明 `scope: song | chart`。

每个标签项在 `items[]` 中同时保存 `id`、`label`、默认值、附属数值对应的样式及详情背景。标签值只允许：

- `int`
- `float`
- `string`
- `tag-group`

`tag-group` 可递归表达 BUDDY 左右物量子表。嵌套标签组作为值时，外层标签项不得声明样式，避免样式继承产生歧义。

### JSON 样式

颜色使用 `solid` 或 `gradient`。渐变可声明方向、颜色位置、流动动画和周期。样式表面支持背景、边框与透明遮罩；文字支持填充、描边和偏移。所有动画都是数据，JSON 中不保存组件、函数或代码。

流动渐变只有在对应缓存标签页可见时运行；失焦时停止并从当前组件生命周期重新开始。

### 页面与交互

Manifest 固定声明 `overview`、`best`、`records`、`catalog`、`detail` 五页。页面通过 `slots[]` 确定共享页面的展示区域，通过 `filters[]` 声明 `tags | list | range` 筛选器。

所有交互必须使用白名单 `ActionRef`：

- `switch-account`
- `upload`
- `sync`
- `route`
- `toggle-favorite`
- `toggle-practice`
- `edit-tags`
- `open-external-search`

`route` 必须提供字符串 `params.pathname`。资源只能使用远程 URL、打包资源键或 Manifest 已注册的 `AssetRef.resolverId`。

## Document

### 歌曲和谱面

结构固定为：

`歌曲 → 类型（可选）→ 难度 → 谱面属性`

`SongDocument.chartGroups[].type` 只能引用类型轴，`charts[].difficulty` 只能引用难度轴。歌曲属性和谱面属性分别只能引用对应 `scope` 的普通属性组。

谱面主键统一使用：

`encode(gameId):encode(songId):encode(typeId | default):encode(difficultyId)`

页面和本地曲库只传递 `chartId`，不再组合 `type + levelIndex`。

### 成绩、最佳和筛选值

成绩卡包含主值、最多两行标签和可选右侧指标。最佳页允许任意栏目和任意数量谱面，序号由共享页面按栏目内顺序生成。

歌曲与成绩通过 `filterValues[filterId]` 提供字符串、数值、布尔值或同类数组。统一筛选引擎负责规范化搜索、选项匹配、范围边界、重置和按 `gameId + page + filterId` 隔离状态。

### 总览

总览文档保存账号名、主信息卡、可选副贴片、一到两个同步动作、工具箱摘要、我的曲库摘要、来源状态与当前版本。动作的实际实现位于动作注册层，不写入 JSON。

## 兼容与错误处理

- 应用内部 SQLite schema 5 使用通用 `chartId`。
- 升级 4→5 时按确认结果重建个人曲库，清空收藏、练习、本地标签和自定义预设，并恢复默认预设。
- 备份 v4 只写 `chartId`；导入 v1–v3 时由游戏适配器转换旧 `type + levelIndex`。
- 查分器协议、原始成绩缓存和原始曲库缓存不属于本契约，不做修改。

## 示例

- `examples/rranker-game-model-v1/manifest.valid.json`
- `examples/rranker-game-model-v1/document.valid.json`
- `examples/rranker-game-model-v1/manifest.invalid-axis.json`
- `examples/rranker-game-model-v1/manifest.invalid-action.json`

合法示例会在单元测试中读取、解析并执行交叉引用校验；非法示例必须被 Zod 拒绝。
