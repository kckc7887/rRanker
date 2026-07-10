# -*- mode: python ; coding: utf-8 -*-
"""rRanker webui-proxy-demo PyInstaller 打包配置（单文件 onefile）。

由 PyInstaller 执行，非普通 Python 脚本。生成 dist/rRanker-demo.exe。
"""

from PyInstaller.utils.hooks import collect_all

# mitmproxy / maimai_py：collect_all 返回 (datas, binaries, hiddenimports)
mitm_datas, mitm_binaries, mitm_hidden = collect_all("mitmproxy")
mai_datas, mai_binaries, mai_hidden = collect_all("maimai_py")

datas = []
datas += mitm_datas
datas += mai_datas
# index.html / addon.py 放到 _MEIPASS 根目录，与 server.py 的 BASE_DIR 逻辑对应
datas += [("index.html", ".")]
datas += [("addon.py", ".")]

binaries = []
binaries += mitm_binaries
binaries += mai_binaries

hiddenimports = []
hiddenimports += mitm_hidden
hiddenimports += mai_hidden
hiddenimports += [
    "proxy_manager",  # 同目录模块，被 server.py 导入
    "winreg",         # 标准库，proxy_manager 依赖，显式声明更稳
]

# 排除不必要的大模块以减小体积
excludes = [
    "tkinter",
    "PyQt5",
    "PyQt6",
    "PySide2",
    "PySide6",
    "matplotlib",
    "numpy",
    "pandas",
    "scipy",
    "IPython",
    "notebook",
    "jupyter",
    "pytest",
]


a = Analysis(
    ["server.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="rRanker-demo",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
