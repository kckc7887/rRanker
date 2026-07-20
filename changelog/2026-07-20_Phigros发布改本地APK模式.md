# Phigros 发布改为本地 APK 模式

## 改动原因

参考 APK 模式依赖 `refer/astrbot_plugin_phi.zip`，对自用发布流程多余；需要改为直接选择本机已有 APK 解包、整理并上传。

## 具体实现

1. 删除参考模式与 `reference.py`、`validate_reference.py`；解包工具链改为内置 `bundled/phiTool/`。
2. 新增 `local` 模式：校验本地 APK 路径，从 `Phigros_<版本>.apk` 推断版本号；WebUI 提供路径输入与 `/api/pick-apk` 系统文件对话框。
3. 保留 `live` 下载最新 APK 模式；`PublishPipeline` 改为以 demo 根目录初始化，不再依赖项目 `refer/`。
4. 新增 `validate_local.py` 与 APK 版本解析单测；更新 README 与 `demo/README.md`。

## 期望输出

- WebUI 默认「本地 APK 解包」，可选文件后直接开始整理/上传。
- 无需参考压缩包即可完成解包发布流程。

## 实际输出

- 单元测试 4 项通过（live 探针仍默认 skip）。
- 内置工具链已从既有 work run 复制到 `bundled/phiTool/`。
