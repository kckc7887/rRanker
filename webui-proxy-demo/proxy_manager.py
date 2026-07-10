"""Windows 系统代理管理模块。

用于安全地保存/恢复用户原始代理设置，并在运行期间开启或关闭系统代理。
仅支持 Windows，依赖标准库 winreg 与 ctypes。
"""

import ctypes
import winreg

# InternetSetOption 选项常量
INTERNET_OPTION_SETTINGS_CHANGED = 39
INTERNET_OPTION_REFRESH = 37

# 注册表路径：HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
_INTERNET_SETTINGS = (
    r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
)

# save_original() 保存的原始值；None 表示尚未保存或原始值不存在
_saved_enable = None  # int (0/1) 或 None
_saved_server = None  # str 或 None


def save_original():
    """读取并保存当前注册表中的 ProxyEnable 与 ProxyServer。"""
    global _saved_enable, _saved_server
    _saved_enable = 0
    _saved_server = None
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, _INTERNET_SETTINGS, 0, winreg.KEY_READ
        ) as key:
            try:
                _saved_enable, _ = winreg.QueryValueEx(key, "ProxyEnable")
            except FileNotFoundError:
                _saved_enable = 0
            try:
                _saved_server, _ = winreg.QueryValueEx(key, "ProxyServer")
            except FileNotFoundError:
                _saved_server = None
    except FileNotFoundError:
        # 顶层键不存在时，按默认关闭代理处理
        _saved_enable = 0
        _saved_server = None


def enable(host, port):
    """开启系统代理，指向 host:port。"""
    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER, _INTERNET_SETTINGS, 0, winreg.KEY_WRITE
    ) as key:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(
            key, "ProxyServer", 0, winreg.REG_SZ, f"{host}:{port}"
        )
    refresh()


def disable():
    """恢复 save_original() 保存的原始代理设置；未保存过则关闭代理。"""
    enable_val = _saved_enable if _saved_enable is not None else 0
    server_val = _saved_server  # None 表示原始无 ProxyServer
    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER, _INTERNET_SETTINGS, 0, winreg.KEY_WRITE
    ) as key:
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, enable_val)
        if server_val is None:
            try:
                winreg.DeleteValue(key, "ProxyServer")
            except FileNotFoundError:
                pass
        else:
            winreg.SetValueEx(
                key, "ProxyServer", 0, winreg.REG_SZ, server_val
            )
    refresh()


def refresh():
    """通知系统代理设置已变更。"""
    ctypes.windll.wininet.InternetSetOptionW(
        0, INTERNET_OPTION_SETTINGS_CHANGED, 0, 0
    )
    ctypes.windll.wininet.InternetSetOptionW(
        0, INTERNET_OPTION_REFRESH, 0, 0
    )
