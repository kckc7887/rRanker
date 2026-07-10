"""
mitmproxy 插件：拦截舞萌DX 微信公众号 OAuth 回调并爬取成绩。
与 wechat-crawler-demo 的区别：通过 state.json / result.json 文件与主进程通信，
便于被 webui 包装层观测，不再仅依赖 ctx.log 终端输出。

用法: mitmdump -s addon.py --listen-port 11451
环境变量:
    RRANKER_OUTPUT_DIR  输出目录（state.json / result.json / maimai_scores.json）
"""
import asyncio
import json
import os
from pathlib import Path

from mitmproxy import http, ctx
from maimai_py import MaimaiClient, WechatProvider, PlayerIdentifier


OUTPUT_DIR = Path(os.environ.get("RRANKER_OUTPUT_DIR") or Path.cwd())


def _write_state(status: str, **extra):
    """写入状态文件，供主进程轮询。"""
    payload = {"status": status, **extra}
    out = OUTPUT_DIR / "state.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


class CrawlWahlap:
    captured: dict | None = None
    running = False

    def request(self, flow: http.HTTPFlow):
        if self.captured or self.running:
            return
        host = flow.request.pretty_host
        path = flow.request.path
        if "wahlap" not in host or "/wc_auth/oauth/callback/maimai-dx" not in path:
            return
        q = flow.request.query
        r, t, code, state = q.get("r"), q.get("t"), q.get("code"), q.get("state")
        if not all([r, t, code, state]):
            return
        self.captured = {"r": r, "t": t, "code": code, "state": state}
        self.running = True
        ctx.log.info("=" * 50)
        ctx.log.info(f"[OK] OAuth captured: r={r[:10]}... t={t} code={code[:10]}...")
        # 主进程通过该标记感知已捕获 OAuth 参数
        ctx.log.info("OAUTH_CAPTURED")
        asyncio.ensure_future(self._crawl_and_save())

    async def _crawl_and_save(self):
        params = self.captured
        try:
            _write_state("crawling", step="oauth", message="正在换取 cookies…")
            ctx.log.info("Step 1: OAuth → cookies")
            maimai = MaimaiClient(timeout=300)
            wx_ident = await maimai.wechat(**params)
            assert isinstance(wx_ident, PlayerIdentifier)

            _write_state("crawling", step="fetch_scores", message="正在爬取成绩（5 难度并行）…")
            ctx.log.info("Step 2: 爬取成绩 (5 难度并行)")
            wx = WechatProvider()
            scores = await maimai.scores(wx_ident, wx)

            _write_state("crawling", step="fetch_player", message="正在获取玩家信息…")
            ctx.log.info("Step 3: 获取玩家信息")
            player = await maimai.players(wx_ident, wx)

            result = {
                "player": {"name": player.name, "friend_code": player.friend_code,
                           "rating": player.rating, "star": player.star,
                           "trophy": player.trophy.name if player.trophy else None},
                "scores": [{
                    "id": s.id, "title": s.title,
                    "type": s.type.value if s.type else None,
                    "level": s.level,
                    "level_index": s.level_index.value if s.level_index else None,
                    "achievements": s.achievements,
                    "dx_score": s.dx_score, "dx_rating": s.dx_rating,
                    "fc": s.fc.name.lower() if s.fc else None,
                    "fs": s.fs.name.lower() if s.fs else None,
                    "rate": s.rate.name.lower() if s.rate else None,
                    "play_time": str(s.play_time) if s.play_time else None,
                    "play_count": s.play_count, "level_value": s.level_value,
                } for s in scores.scores]
            }

            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

            # 兼容旧文件
            legacy = OUTPUT_DIR / "maimai_scores.json"
            with open(legacy, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            # 主进程读取的结果文件
            result_path = OUTPUT_DIR / "result.json"
            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            _write_state("done", count=len(scores.scores))

            ctx.log.info(f"[DONE] Saved {len(scores.scores)} scores to {result_path}")
            ctx.log.info(f"Rating={scores.rating} Player={player.name}")

            fc_count = sum(1 for s in scores.scores if s.fc)
            fs_count = sum(1 for s in scores.scores if s.fs)
            ctx.log.info(f"fc={fc_count}/{len(scores.scores)} fs={fs_count}/{len(scores.scores)}")

        except Exception as e:
            ctx.log.error(f"Crawl failed: {e}")
            _write_state("error", message=str(e))
        finally:
            ctx.master.shutdown()


addons = [CrawlWahlap()]
