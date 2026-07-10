"""
舞萌DX 微信公众号成绩爬取
用法: mitmdump -s wechat_addon.py --listen-port 11451
然后: 系统代理设为 127.0.0.1:11451 → PC微信打开「舞萌DX」公众号
"""
import asyncio
import json
import sys
from pathlib import Path

from mitmproxy import http, ctx
from maimai_py import MaimaiClient, WechatProvider, PlayerIdentifier

OUTPUT_DIR = Path.cwd()


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
        asyncio.ensure_future(self._crawl_and_save())

    async def _crawl_and_save(self):
        params = self.captured
        try:
            ctx.log.info("Step 1: OAuth → cookies")
            maimai = MaimaiClient(timeout=300)
            wx_ident = await maimai.wechat(**params)
            assert isinstance(wx_ident, PlayerIdentifier)

            ctx.log.info("Step 2: 爬取成绩 (5 难度并行)")
            wx = WechatProvider()
            scores = await maimai.scores(wx_ident, wx)
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

            out = OUTPUT_DIR / "maimai_scores.json"
            with open(out, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            ctx.log.info(f"[DONE] Saved {len(scores.scores)} scores to {out}")
            ctx.log.info(f"Rating={scores.rating} Player={player.name}")

            fc_count = sum(1 for s in scores.scores if s.fc)
            fs_count = sum(1 for s in scores.scores if s.fs)
            ctx.log.info(f"fc={fc_count}/{len(scores.scores)} fs={fs_count}/{len(scores.scores)}")

        except Exception as e:
            ctx.log.error(f"Crawl failed: {e}")
        finally:
            ctx.master.shutdown()


addons = [CrawlWahlap()]
