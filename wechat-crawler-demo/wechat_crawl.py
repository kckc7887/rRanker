# -*- coding: utf-8 -*-
"""
舞萌DX 微信公众号成绩爬取 - 全自动版
python wechat_crawl.py
"""
import subprocess, os, sys, json, time, asyncio
from pathlib import Path
from maimai_py import MaimaiClient, WechatProvider, PlayerIdentifier

PORT = 11451
ADDON = Path(__file__).parent / "wechat_addon.py"
OUTPUT = Path(__file__).parent / "maimai_scores.json"

# ---- 启动 mitmdump ----
print(f"启动代理 mitmdump --listen-port {PORT} ...")
print(f"代理地址: 127.0.0.1:{PORT}")
print()

# 生成 OAuth URL
async def get_oauth_url():
    maimai = MaimaiClient(timeout=30)
    return await maimai.wechat()

oauth_url = asyncio.run(get_oauth_url())
print(f"OAuth URL:\n{oauth_url}\n")
print("=" * 60)
print("操作:")
print("  1. 复制上方链接, 在 PC 微信内打开")
print("  2. 公众号加载后自动拦截 → 爬取成绩")
print("=" * 60)
print()

proc = subprocess.Popen(
    ["mitmdump", "-s", str(ADDON), "--listen-port", str(PORT), "--mode", "local"],
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    text=True, bufsize=1,
)

scores_file = None
for line in proc.stdout:
    print(line, end="")
    if "maimai_scores.json" in line:
        scores_file = OUTPUT
    if "shutdown" in line.lower() or proc.poll() is not None:
        break

proc.terminate()
time.sleep(1)

if scores_file and scores_file.exists():
    with open(scores_file, encoding="utf-8") as f:
        data = json.load(f)
    p = data["player"]
    s = data["scores"]
    print(f"\n{'='*60}")
    print(f"爬取完成!")
    print(f"玩家: {p['name']} (FriendCode={p['friend_code']})")
    print(f"Rating: {p['rating']}  Star: {p['star']}")
    print(f"成绩: {len(s)} 条")
    print(f"保存: {scores_file}")
    print(f"{'='*60}")
else:
    print("\n超时或未拦截到 OAuth 回调，请重试")
