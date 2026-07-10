"""
水鱼 (DivingFish) 数据源
验证查分 + 上传 API
"""
import json, urllib.request, urllib.error
from pathlib import Path

BASE = "https://www.diving-fish.com/api/maimaidxprober"
OUTPUT = Path(__file__).parent / "divingfish_demo.json"
IMPORT_TOKEN = "54a45f653e0dbb1e5b40c58560c5aa24c455000474f08a5e233407d4524aee552ffb0f80a54a68622b5f499b59c784a4847045dd6d85ec95fabafa042e43d396"


def fetch(url, method="GET", body=None, headers=None):
    req = urllib.request.Request(url, method=method)
    if body:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(body).encode()
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")
    except Exception as e:
        return -1, str(e)


def main():
    results = {}
    print("=" * 60)
    print("水鱼 (DivingFish) API")
    print("=" * 60)

    # 1. 曲库
    print("\n[1/5] GET /music_data ...")
    code, data = fetch(f"{BASE}/music_data")
    print(f"  {code}  曲目: {len(data) if isinstance(data,list) else '?'}")

    # 2. 谱面统计
    print("\n[2/5] GET /chart_stats ...")
    code, data = fetch(f"{BASE}/chart_stats")
    print(f"  {code}")

    # 3. B50 (公开查询，无 token)
    print("\n[3/5] POST /query/player ...")
    code, data = fetch(f"{BASE}/query/player", method="POST", body={"b50": True})
    print(f"  {code} (预期 400, 需 username/qqid)")

    # 4. 获取当前成绩 (需要 token)
    print("\n[4/5] GET /player/records ...")
    code, data = fetch(f"{BASE}/player/records", headers={"Import-Token": IMPORT_TOKEN})
    if code == 200:
        records = data.get("records", [])
        print(f"  {code}  已有成绩: {len(records)} 条")
    else:
        print(f"  {code}  {str(data)[:200]}")

    # 5. 上传一条测试成绩
    print("\n[5/5] POST /player/update_records ...")
    test_score = [{
        "title": "壱雫空",
        "level_index": 0,
        "achievements": 99.9261,
        "fc": "fcp",
        "fs": "sync",
        "dxScore": 318,
        "type": "dx"
    }]
    code, data = fetch(f"{BASE}/player/update_records", method="POST",
                       body=test_score,
                       headers={"Import-Token": IMPORT_TOKEN})
    if code == 200:
        print(f"  {code}  上传成功")
    else:
        print(f"  {code}  {str(data)[:200]}")

    # 保存完整数据
    code, data = fetch(f"{BASE}/player/records", headers={"Import-Token": IMPORT_TOKEN})
    if code == 200:
        results = data
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n保存: {OUTPUT}")


if __name__ == "__main__":
    main()
