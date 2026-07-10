"""rRanker webui-proxy-demo HTTP 服务器主程序。

启动本地 HTTP 服务、打开浏览器，并协调 mitmdump 子进程与系统代理。
作为整个 demo 的入口点：双击 exe 或运行 `python server.py` 即可。

依赖同目录下的 proxy_manager.py、addon.py、index.html。
"""

import asyncio
import atexit
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import proxy_manager
from maimai_py import MaimaiClientMultithreading as MaimaiClient

# ---------- 资源路径 ----------
# PyInstaller 打包后资源在 _MEIPASS；否则用脚本所在目录
if getattr(sys, "frozen", False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

INDEX_HTML = os.path.join(BASE_DIR, "index.html")
ADDON_PY = os.path.join(BASE_DIR, "addon.py")

MITM_PORT = 11451

# ---------- 全局状态（受 _state_lock 保护）----------
_state_lock = threading.Lock()
_state = "idle"          # idle / proxy_starting / waiting_oauth / crawling / done / error
_oauth_url = None        # waiting_oauth 期间展示给前端的授权链接
_error_msg = None        # error 状态下的错误描述
_result = None           # done 状态下的 {"player": {...}, "scores": [...]}
_crawl_msg = None        # crawling 状态下的进度提示（来自 addon 的 state.json）

# 子进程与输出目录（非状态，单独管理）
_mitm_proc = None        # subprocess.Popen 或 None
_output_dir = None       # str 临时目录，addon 通过环境变量写入此处

_lxns_songs = None       # dict: song_id(str) → {"title":..., "artist":...}，落雪曲库（后台拉取）


def _read_state_json():
    """读取 addon 写入的 state.json；不存在或损坏返回 None。"""
    if not _output_dir:
        return None
    p = os.path.join(_output_dir, "state.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _read_result_json():
    """读取 addon 写入的 result.json；不存在或损坏返回 None。"""
    if not _output_dir:
        return None
    p = os.path.join(_output_dir, "result.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _fetch_lxns_songs():
    """后台拉取落雪曲库，构建 {song_id: {"title":..., "artist":...}} 映射存入 _lxns_songs。

    失败则置空 dict，前端可稍后重试 /api/songs。
    """
    global _lxns_songs
    url = "https://maimai.lxns.net/api/v0/maimai/song/list"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "rRanker/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        mapping = {}
        for s in data.get("songs") or []:
            sid = s.get("id")
            if sid is None:
                continue
            mapping[str(sid)] = {
                "title": s.get("title", ""),
                "artist": s.get("artist", ""),
            }
        _lxns_songs = mapping
    except Exception:
        _lxns_songs = {}


def _mitm_alive():
    """mitmdump 子进程是否仍在运行。"""
    return _mitm_proc is not None and _mitm_proc.poll() is None


def _finish_crawl(success: bool, result=None, message=None):
    """爬取结束统一处理：写最终状态，关代理和 mitmdump。"""
    global _state, _result, _error_msg
    _stop_mitm()
    try:
        proxy_manager.disable()
    except Exception:
        pass
    with _state_lock:
        if success:
            _state = "done"
            _result = result
        else:
            _state = "error"
            _error_msg = message or "未知错误"
    # result 已读入内存，临时目录可清理
    _cleanup_tempdir()


def _update_status_from_state():
    """根据 state.json 与子进程存活情况推进全局状态。

    在每次 /api/status 请求时调用。仅当当前处于 waiting_oauth 或 crawling
    时才检查，避免覆盖 idle/done/error 等稳定状态。
    """
    global _state, _result, _error_msg, _crawl_msg
    with _state_lock:
        cur = _state
    if cur not in ("waiting_oauth", "crawling"):
        return

    sj = _read_state_json()
    if sj is not None:
        st = sj.get("status")
        if cur == "waiting_oauth":
            if st == "crawling":
                with _state_lock:
                    _state = "crawling"
                    _crawl_msg = sj.get("message", "正在爬取成绩…")
            elif st == "done":
                r = _read_result_json()
                _finish_crawl(True, result=r)
            elif st == "error":
                _finish_crawl(False, message=sj.get("message", "未知错误"))
        elif cur == "crawling":
            if st == "crawling":
                # 更新进度消息
                with _state_lock:
                    _crawl_msg = sj.get("message", _crawl_msg or "正在爬取成绩…")
            elif st == "done":
                r = _read_result_json()
                _finish_crawl(True, result=r)
            elif st == "error":
                _finish_crawl(False, message=sj.get("message", "未知错误"))
        return

    # state.json 不存在：若子进程已退出且尚未得到结论，视为异常
    if not _mitm_alive():
        _finish_crawl(False, message="mitmdump 进程意外退出")


def _mitm_stdout_reader(proc):
    """后台线程：逐行读取 mitmdump stdout，检测 OAUTH_CAPTURED 标记。

    主状态推进仍依赖 state.json；此处仅作辅助感知与防阻塞读。
    """
    try:
        for raw in iter(proc.stdout.readline, ""):
            line = raw.strip()
            if not line:
                continue
            # OAUTH_CAPTURED 标记：addon 已捕获 OAuth 参数，即将进入 crawling
            if line == "OAUTH_CAPTURED":
                pass
    except Exception:
        pass


def _mitm_cert_paths():
    """mitmproxy CA 证书路径（PEM 给 Python 库，CER 给 Windows 信任存储）。"""
    d = os.path.join(os.path.expanduser("~"), ".mitmproxy")
    return os.path.join(d, "mitmproxy-ca-cert.pem"), os.path.join(d, "mitmproxy-ca-cert.cer")


def _ensure_mitm_cert():
    """确保 mitmproxy CA 证书已生成。不存在则启动临时 mitmdump 触发生成。"""
    pem_path, cer_path = _mitm_cert_paths()
    if os.path.exists(pem_path):
        return pem_path, cer_path
    # 启动临时 mitmdump 让它生成证书，用完即杀
    try:
        proc = subprocess.Popen(
            ["mitmdump", "--listen-port", "18888"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(50):  # 最多等 5 秒
            if os.path.exists(pem_path):
                break
            time.sleep(0.1)
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception:
        pass
    return pem_path, cer_path


def _install_mitm_cert(cer_path):
    """安装 CA 证书到当前用户信任存储（不需要管理员权限）。

    会弹出 Windows 安全确认框，用户需点「是」确认安装。
    """
    if not os.path.exists(cer_path):
        return
    try:
        # 不捕获输出：让 Windows 安全确认框正常显示给用户
        subprocess.run(
            ["certutil", "-user", "-addstore", "Root", cer_path],
            timeout=60,
        )
    except Exception:
        pass


def _is_cert_installed():
    """检测 mitmproxy CA 证书是否已安装到当前用户 Root 存储。"""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-ChildItem Cert:\\CurrentUser\\Root | Where-Object {$_.Subject -like '*mitmproxy*'} | Select-Object -First 1"],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return "mitmproxy" in (result.stdout or "").lower()
    except Exception:
        return False


def _ensure_cert_ready():
    """确保证书就绪：检测 → 安装 → 重新检测确认。

    返回 True 表示已就绪，False 表示安装失败。
    """
    if _is_cert_installed():
        return True
    pem_path, cer_path = _ensure_mitm_cert()
    _install_mitm_cert(cer_path)
    return _is_cert_installed()


def _start_mitm():
    """启动 mitmdump 子进程并准备输出目录。"""
    global _mitm_proc, _output_dir
    _output_dir = tempfile.mkdtemp(prefix="rranker_")
    # 清理可能残留的旧通信文件
    for fn in ("state.json", "result.json"):
        p = os.path.join(_output_dir, fn)
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    # 证书已在启动时（main 中 _ensure_cert_ready）处理，这里不再重复安装

    env = os.environ.copy()
    env["RRANKER_OUTPUT_DIR"] = _output_dir
    # addon 在 mitmproxy 子进程里用 httpx 请求 wahlap 换取 cookies。
    # httpx 不读 Windows 注册表代理，但仍可能受 HTTP_PROXY/HTTPS_PROXY 环境变量影响。
    # 设 NO_PROXY 确保 maimai_py 的请求绕过代理直连上游，避免回环到 mitmproxy 自己。
    # 注意：不能设 SSL_CERT_FILE 指向 mitmproxy CA，否则会替换系统默认 CA 存储，
    # 导致直连请求无法验证真实服务器证书。直连请求用系统默认 CA 即可。
    env["NO_PROXY"] = "tgk-wcaime.wahlap.com,maimai.wahlap.com,*.wahlap.com,localhost,127.0.0.1"
    env["no_proxy"] = env["NO_PROXY"]

    # --ssl-insecure: mitmproxy 不验证上游服务器证书，避免上游证书链问题
    cmd = ["mitmdump", "-s", ADDON_PY, "--listen-port", str(MITM_PORT), "--ssl-insecure"]
    _mitm_proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        cwd=BASE_DIR,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    t = threading.Thread(target=_mitm_stdout_reader, args=(_mitm_proc,), daemon=True)
    t.start()
    # 给 mitmdump 一点启动时间，避免代理开启后还未就绪
    time.sleep(1.5)


def _stop_mitm():
    """终止 mitmdump 子进程：先 terminate，超时则 kill。"""
    global _mitm_proc
    proc = _mitm_proc
    if proc is None:
        return
    try:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
    except Exception:
        pass
    _mitm_proc = None


def _cleanup_tempdir():
    """删除临时输出目录（result 已读入内存 _result，可安全清理）。"""
    global _output_dir
    d = _output_dir
    if not d:
        return
    try:
        shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass
    _output_dir = None


def _cleanup():
    """退出清理：终止 mitmdump 并恢复系统代理。"""
    _stop_mitm()
    try:
        proxy_manager.disable()
    except Exception:
        pass
    _cleanup_tempdir()


# ---------- HTTP 请求处理 ----------
class Handler(BaseHTTPRequestHandler):
    """处理 webUI 与 API 请求。"""

    # 静默默认日志，避免污染控制台
    def log_message(self, *args):
        pass

    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, text):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._serve_index()
            return
        if self.path == "/api/status":
            self._handle_status()
            return
        if self.path == "/api/songs":
            self._handle_songs()
            return
        self.send_error(404)

    def do_POST(self):
        if self.path == "/api/start":
            self._handle_start()
            return
        if self.path == "/api/stop":
            self._handle_stop()
            return
        if self.path == "/api/reset":
            self._handle_reset()
            return
        self.send_error(404)

    def _serve_index(self):
        try:
            with open(INDEX_HTML, "r", encoding="utf-8") as f:
                self._send_html(f.read())
        except OSError as e:
            self._send_json({"status": "error", "error": f"读取页面失败: {e}"}, 500)

    def _handle_start(self):
        """POST /api/start：启动代理 + mitmdump + 生成 OAuth URL。"""
        global _state, _oauth_url, _error_msg, _result
        # 仅 idle 与 error 允许重新开始；其余返回 409
        # （error 允许是为了配合前端 error 状态下的「重试」按钮）
        with _state_lock:
            cur = _state
        if cur not in ("idle", "error"):
            with _state_lock:
                snap = _state
            self._send_json(
                {"status": snap, "error": "当前状态不允许启动"}, 409
            )
            return

        # error 状态下重新开始前先清理上次残留
        if cur == "error":
            _stop_mitm()
            try:
                proxy_manager.disable()
            except Exception:
                pass

        with _state_lock:
            _state = "proxy_starting"
            _oauth_url = None
            _error_msg = None
            _result = None

        try:
            proxy_manager.save_original()
            # 先生成 OAuth URL（此时还未开代理，请求直连 maimai.py 服务器）
            # 再启动 mitmdump + 设置系统代理，避免 OAuth URL 请求被代理干扰
            url = asyncio.run(MaimaiClient().wechat())
            _start_mitm()
            proxy_manager.enable("127.0.0.1", MITM_PORT)
            with _state_lock:
                _state = "waiting_oauth"
                _oauth_url = url
            self._send_json({"status": "waiting_oauth", "oauth_url": url})
        except Exception as e:
            # 任何异常都回滚：停 mitmdump、关代理、置 error
            _stop_mitm()
            try:
                proxy_manager.disable()
            except Exception:
                pass
            with _state_lock:
                _state = "error"
                _error_msg = str(e)
            self._send_json({"status": "error", "error": str(e)}, 500)

    def _handle_stop(self):
        """POST /api/stop：终止 mitmdump + 恢复代理。

        保留已有结果（_result），用户中止后仍可查看已爬到的成绩。
        如果已有结果则回到 done 状态，否则回 idle。
        """
        global _state, _oauth_url, _error_msg
        _stop_mitm()
        try:
            proxy_manager.disable()
        except Exception:
            pass
        with _state_lock:
            _oauth_url = None
            _error_msg = None
            if _result is not None:
                _state = "done"
            else:
                _state = "idle"
            cur = _state
        # done 状态保留临时目录以备读取；idle 状态清理临时目录
        if cur != "done":
            _cleanup_tempdir()
        if cur == "done":
            self._send_json({"status": "done"})
        else:
            self._send_json({"status": "idle"})

    def _handle_status(self):
        """GET /api/status：返回当前状态及附加数据。"""
        _update_status_from_state()
        with _state_lock:
            cur = _state
            url = _oauth_url
            err = _error_msg
            res = _result
            msg = _crawl_msg
        if cur == "idle":
            self._send_json({"status": "idle"})
        elif cur == "proxy_starting":
            self._send_json({"status": "proxy_starting"})
        elif cur == "waiting_oauth":
            self._send_json({"status": "waiting_oauth", "oauth_url": url or ""})
        elif cur == "crawling":
            self._send_json({"status": "crawling", "message": msg or "正在爬取成绩…"})
        elif cur == "done":
            self._send_json({
                "status": "done",
                "player": (res or {}).get("player", {}),
                "scores": (res or {}).get("scores", []),
            })
        elif cur == "error":
            self._send_json({"status": "error", "error": err or "未知错误"})
        else:
            self._send_json({"status": "idle"})

    def _handle_songs(self):
        """GET /api/songs：返回落雪曲库。

        曲库由后台线程拉取，尚未加载完时返回空对象，前端可稍后重试。
        """
        self._send_json({"songs": _lxns_songs or {}})

    def _handle_reset(self):
        """POST /api/reset：清空所有状态回到初始 idle。"""
        global _state, _oauth_url, _error_msg, _result, _crawl_msg
        _stop_mitm()
        try:
            proxy_manager.disable()
        except Exception:
            pass
        _cleanup_tempdir()
        with _state_lock:
            _state = "idle"
            _oauth_url = None
            _error_msg = None
            _result = None
            _crawl_msg = None
        self._send_json({"status": "idle"})


def main():
    """入口：注册清理钩子、启动 HTTP 服务、打开浏览器。"""
    atexit.register(_cleanup)

    def _signal_handler(signum, frame):
        _cleanup()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # 启动前确保证书就绪：检测 → 生成 → 安装 → 重新检测确认
    # 失败不阻止启动（用户可能在无管理员权限时需手动安装）
    if not _ensure_cert_ready():
        print("警告: mitmproxy CA 证书安装失败，可能需要手动安装")

    # 后台拉取落雪曲库，不阻塞主流程
    threading.Thread(target=_fetch_lxns_songs, daemon=True).start()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print(f"Server running on {url}")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _cleanup()


if __name__ == "__main__":
    main()
