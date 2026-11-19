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

from app import app as mindspace_app  # noqa: E402  (mindspace/app.py)

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
    await mindspace_app(scope, receive, send)
