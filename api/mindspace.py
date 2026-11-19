"""Vercel Function chạy MindSpace (tab "Tâm sự") trong cùng project với MagerLife.

vercel.json chuyển /mindspace/* về file này. Tuỳ cách Vercel truyền đường dẫn, app có thể
nhận /mindspace/api/chat hoặc /api/mindspace/api/chat; cả hai được cắt về /api/chat trước
khi tới FastAPI của MindSpace (mindspace/app.py), nên MindSpace không phải biết mình chạy ở đâu.
"""

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_MINDSPACE_DIR = os.path.join(_ROOT, "mindspace")
if _MINDSPACE_DIR not in sys.path:
    sys.path.insert(0, _MINDSPACE_DIR)

import json  # noqa: E402
import re  # noqa: E402
import traceback  # noqa: E402

try:
    from app import app as mindspace_app  # noqa: E402  (mindspace/app.py)
    _startup_error = None
except Exception as exc:  # noqa: BLE001 — báo lỗi khởi động thay vì để function crash câm
    traceback.print_exc()  # traceback đầy đủ nằm trong log Vercel
    mindspace_app = None
    # Che phần user:password@ nếu thông báo lỗi có lẫn chuỗi kết nối DB.
    _message = re.sub(r"://[^@\s/]+@", "://***@", str(exc))[:500]
    _startup_error = {"code": "MINDSPACE_STARTUP_FAILED", "type": type(exc).__name__, "message": _message}


async def _startup_failed(scope, receive, send):
    if scope["type"] != "http":
        return
    body = json.dumps({"error": _startup_error}, ensure_ascii=False).encode("utf-8")
    await send({"type": "http.response.start", "status": 503, "headers": [
        (b"content-type", b"application/json; charset=utf-8"), (b"cache-control", b"no-store")]})
    await send({"type": "http.response.body", "body": body})


_PREFIXES = ("/api/mindspace.py", "/api/mindspace", "/mindspace")


def _strip_prefix(path: str) -> str:
    for prefix in _PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return path[len(prefix):] or "/"
    return path


async def app(scope, receive, send):
    if scope["type"] in ("http", "websocket"):
        path = _strip_prefix(scope.get("path", "/"))
        scope = {**scope, "path": path, "raw_path": path.encode("utf-8"), "root_path": ""}
    if mindspace_app is None:
        await _startup_failed(scope, receive, send)
        return
    await mindspace_app(scope, receive, send)
