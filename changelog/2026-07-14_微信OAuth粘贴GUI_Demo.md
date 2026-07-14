# 微信 OAuth 用户粘贴 GUI Demo

## 改动原因
用户准备 M5，要求做一个「用户粘贴」情景的 Python GUI Demo：生成微信内打开的授权链接，并提供输入框粘贴回调后解析。

## 具体实现
- 新增 `demo/wechat-oauth-paste-demo/oauth_paste_gui.py`（tkinter，标准库）
- 新增 `run.bat` 便于 Windows 双击启动
- 新增目录 `README.md`；在 `demo/README.md` 归档表中登记
- 范围：只生成授权链接 + 解析 `r/t/code/state`；不换 cookie、不爬成绩、不上传

## 期望输出
双击 `run.bat` 打开窗口；可生成授权链接；粘贴回调 URL 后解析出四参数 JSON。

## 实际输出
Demo 已落在 `demo/wechat-oauth-paste-demo/`；依赖仅 Python 标准库。
