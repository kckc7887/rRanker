# Phigros 成绩图曲绘缓存 OOM

## 改动原因

Phigros 成绩图把曲绘读成 base64 data URI 后，在模块 Map、session ref、React state、HTML 字符串中重复持有，Best30 单次即可到约 100MB JS 堆，切换筛选后模块缓存涨到 300MB+，易导致闪退。

## 具体实现

1. `loadRemoteImageDataUri` / `loadPhigrosIllustrations` 改为预取后复制到 `Documents/rranker/phigros-illustration-stage`，只返回短 `file://` URI，不再 `base64()` 读入内存。
2. WebView `allowingReadAccessToURL` 改为 `Documents/rranker`，覆盖字体目录与曲绘舞台。
3. `illustrationCacheRef` 每次只保留当前选中曲目，切换筛选时剪枝陈旧条目。
4. 清理 Phigros 存储时同步删除曲绘舞台目录。

## 期望输出

- Best30 / 切换筛选后，JS 侧曲绘相关字符串体积从百 MB 级降到 KB 级（仅路径）。
- 预览/导出仍能显示曲绘；不再因曲绘 base64 堆积闪退。

## 实际输出

- 修复前 Best30：`batchMb≈95.9`、`htmlMb≈117`，切换后模块缓存约 328MB。
- 修复后同场景：`batchMb≈0.01`、`htmlMb≈2`、`dataUriCount=0`，曲绘以 `file://` 引用；切换筛选不再堆积 base64。
- 已移除调试埋点。
