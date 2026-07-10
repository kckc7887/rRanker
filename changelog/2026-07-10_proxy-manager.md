# 2026-07-10 proxy-manager

## 改动原因

webui-proxy-demo 需要一个 Windows 系统代理管理模块，用于在运行期间自动开启/关闭系统代理，并安全地保存与恢复用户原始代理设置，避免改坏用户环境。

## 具体实现

新增文件 `webui-proxy-demo/proxy_manager.py`，纯标准库实现：

- 模块级常量：`INTERNET_OPTION_SETTINGS_CHANGED = 39`、`INTERNET_OPTION_REFRESH = 37`，注册表路径 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`。
- `save_original()`：用 `winreg` 打开 Internet Settings 键，分别读取 `ProxyEnable`（DWORD）与 `ProxyServer`（REG_SZ），值不存在时以 `FileNotFoundError` 捕获；保存到模块级变量 `_saved_enable` / `_saved_server`，`ProxyServer` 不存在时记为 `None`。
- `enable(host, port)`：写入 `ProxyEnable=1`（REG_DWORD）、`ProxyServer=host:port`（REG_SZ），随后调用 `refresh()`。
- `disable()`：恢复 `save_original()` 保存的值；未保存过则默认 `ProxyEnable=0`；原始 `ProxyServer` 为 `None` 时尝试 `DeleteValue` 清除，不存在则忽略；最后 `refresh()`。
- `refresh()`：通过 `ctypes.windll.wininet.InternetSetOptionW` 依次发送 `INTERNET_OPTION_SETTINGS_CHANGED` 与 `INTERNET_OPTION_REFRESH`，通知系统刷新。

零额外依赖，仅用 `winreg` 与 `ctypes`。

## 期望输出

- 文件存在于 `webui-proxy-demo/proxy_manager.py`。
- 模块可被导入，四个函数（`save_original`/`enable`/`disable`/`refresh`）均存在。
- 在 Windows 上调用 `enable` 后注册表 `ProxyEnable` 变为 1、`ProxyServer` 变为指定 `host:port`；`disable` 后恢复为 `save_original` 时读到的原始值。

## 实际输出

- 已创建目录 `webui-proxy-demo` 与 `d:\Projects\rRanker\webui-proxy-demo\proxy_manager.py`。
- 静态验证：AST 解析通过；模块在 Windows 上可正常导入；`save_original`/`enable`/`disable`/`refresh` 四个函数均存在；常量 `INTERNET_OPTION_SETTINGS_CHANGED=39`、`INTERNET_OPTION_REFRESH=37` 正确。
- 未做真实代理写入与系统刷新的运行时验证（避免改动当前环境代理设置）。
