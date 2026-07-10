# -*- coding: utf-8 -*-
"""rRanker webui-proxy-demo 一键打包脚本。

用法：
    python build.py             # 清理后打包
    python build.py --no-clean  # 跳过清理旧的 build/ dist/

依赖：PyInstaller、mitmproxy、maimai_py。
产出：dist/rRanker-demo.exe
"""

import argparse
import importlib.util
import os
import shutil
import subprocess
import sys

# 脚本所在目录（webui-proxy-demo/）
HERE = os.path.dirname(os.path.abspath(__file__))
SPEC_FILE = os.path.join(HERE, "build.spec")
DIST_DIR = os.path.join(HERE, "dist")
BUILD_DIR = os.path.join(HERE, "build")
EXE_PATH = os.path.join(DIST_DIR, "rRanker-demo.exe")


def _check_module(name):
    """返回模块是否可导入。"""
    return importlib.util.find_spec(name) is not None


def check_dependencies():
    """检查打包所需依赖；缺失则提示并退出。"""
    missing = []
    # PyInstaller 是打包工具，必须存在
    if not _check_module("PyInstaller"):
        missing.append("pyinstaller")
    # 运行时依赖，collect_all 需要能找到它们
    if not _check_module("mitmproxy"):
        missing.append("mitmproxy")
    if not _check_module("maimai_py"):
        missing.append("maimai_py")

    if missing:
        print("[ERROR] 缺少以下依赖：")
        for m in missing:
            print(f"  - {m}")
        print("请先安装：")
        print(f"    pip install {' '.join(missing)}")
        sys.exit(1)


def clean_build_artifacts():
    """清理旧的 build/ 和 dist/ 目录。"""
    for d in (BUILD_DIR, DIST_DIR):
        if os.path.isdir(d):
            print(f"[INFO] 清理 {d}")
            shutil.rmtree(d, ignore_errors=True)


def run_pyinstaller():
    """调用 PyInstaller 按 build.spec 打包。"""
    cmd = [sys.executable, "-m", "PyInstaller", SPEC_FILE, "--noconfirm"]
    print("[INFO] 执行：", " ".join(cmd))
    # 工作目录设为脚本所在目录，spec 中的相对路径据此解析
    result = subprocess.run(cmd, cwd=HERE)
    if result.returncode != 0:
        print("[ERROR] PyInstaller 打包失败")
        sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="rRanker webui-proxy-demo 打包脚本")
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="跳过清理旧的 build/ 和 dist/ 目录",
    )
    args = parser.parse_args()

    check_dependencies()

    if not args.no_clean:
        clean_build_artifacts()
    else:
        print("[INFO] 跳过清理（--no-clean）")

    run_pyinstaller()

    if os.path.isfile(EXE_PATH):
        print("[OK] 打包完成：")
        print(f"     {EXE_PATH}")
    else:
        print(f"[ERROR] 未找到预期产出：{EXE_PATH}")
        sys.exit(1)


if __name__ == "__main__":
    main()
