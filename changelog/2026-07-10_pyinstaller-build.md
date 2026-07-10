# 2026-07-10 pyinstaller-build

## 改动原因

webui-proxy-demo 需要在无 Python 环境的 Windows 机器上双击即用，因此需要一套 PyInstaller 打包配置，把 server.py 入口、mitmproxy、maimai_py、index.html、addon.py 等全部打包成单个 exe 文件。

## 具体实现

新增两个文件：

### `webui-proxy-demo/build.spec`

PyInstaller spec 文件，由 PyInstaller 执行：

- 入口 `server.py`，单文件（onefile）模式，`console=True` 保留控制台窗口以查看 mitmdump 输出与错误信息。
- `collect_all("mitmproxy")` 与 `collect_all("maimai_py")` 获取 datas/binaries/hiddenimports，确保 CA 证书等数据文件完整打包。
- `datas` 追加 `("index.html", ".")` 与 `("addon.py", ".")`，目标路径为 `.`，对应 server.py 中打包态用 `sys._MEIPASS` 作为 `BASE_DIR`、从根目录读取 `index.html`/`addon.py` 的逻辑。
- `hiddenimports` 显式补充 `proxy_manager`（同目录模块，被 server.py 导入）与 `winreg`（proxy_manager 依赖的标准库，显式声明更稳）。
- `excludes` 排除 tkinter / PyQt5/6 / PySide2/6 / matplotlib / numpy / pandas / scipy / IPython / notebook / jupyter / pytest 等不需要的大模块以减小体积。
- 结构为标准 onefile：`Analysis → PYZ(a.pure) → EXE(pyz, a.scripts, a.binaries, a.datas, ...)`，`name="rRanker-demo"`，`runtime_tmpdir=None`。

### `webui-proxy-demo/build.py`

一键打包脚本，普通 Python 入口，`if __name__ == "__main__":` 保护：

- `check_dependencies()`：用 `importlib.util.find_spec` 检查 PyInstaller / mitmproxy / maimai_py，缺失则提示 `pip install ...` 并 `sys.exit(1)`。
- `clean_build_artifacts()`：删除旧的 `build/` 与 `dist/` 目录。
- `run_pyinstaller()`：`subprocess.run([sys.executable, "-m", "PyInstaller", SPEC_FILE, "--noconfirm"], cwd=HERE)`，cwd 设为脚本所在目录使 spec 中相对路径（`server.py`、`index.html`、`addon.py`）能正确解析；失败则按返回码退出。
- `--no-clean` 参数跳过清理。
- 打包后校验 `dist/rRanker-demo.exe` 是否存在，存在则打印路径，否则报错退出。

## 期望输出

- `webui-proxy-demo/build.spec` 与 `webui-proxy-demo/build.py` 存在且语法正确。
- `python build.py` 在已安装依赖的环境下能调用 PyInstaller 完成打包，产出 `dist/rRanker-demo.exe`。
- 运行 exe 后，server.py 能从 `_MEIPASS` 根目录读到 `index.html` 与 `addon.py`，mitmdump 能加载 addon.py，maimai_py 与 mitmproxy 的数据文件（含 CA 证书）可用。

## 实际输出

- 已创建 `d:\Projects\rRanker\webui-proxy-demo\build.spec` 与 `d:\Projects\rRanker\webui-proxy-demo\build.py`。
- 静态验证：`python -m py_compile build.py build.spec` 通过（退出码 0）。
- 未执行真实 PyInstaller 打包（当前环境未确认安装 mitmproxy / maimai_py / PyInstaller，且打包耗时较长，按需由用户在具备依赖的环境运行 `python build.py`）。
