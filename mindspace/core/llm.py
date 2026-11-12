# ============================================================
# core/llm.py — Client Claude dùng chung cho toàn pipeline
#
# Hai model, cấu hình qua env:
#   MINDSPACE_CHAT_MODEL      (mặc định claude-sonnet-5-5) — viết câu trả lời
#   MINDSPACE_ANALYZER_MODEL  (mặc định claude-haiku-5-5)  — phân tích cảm xúc/ý định
# ============================================================

import os

import anthropic
from dotenv import load_dotenv

load_dotenv()

CHAT_MODEL     = os.getenv("MINDSPACE_CHAT_MODEL", "claude-sonnet-5-5")
ANALYZER_MODEL = os.getenv("MINDSPACE_ANALYZER_MODEL", "claude-haiku-5-5")
CHAT_EFFORT    = os.getenv("MINDSPACE_CHAT_EFFORT", "low")

# Lỗi gọi Claude mà pipeline sẽ bắt để chuyển sang câu trả lời soạn sẵn.
# Không bắt Exception chung để lỗi lập trình vẫn lộ ra.
API_ERRORS = (anthropic.APIError,)

_client = None


def get_client() -> anthropic.Anthropic:
    """Một client cho cả process. Đọc ANTHROPIC_API_KEY từ môi trường."""
    global _client
    if _client is None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY chưa được đặt")
        _client = anthropic.Anthropic(
            timeout=float(os.getenv("MINDSPACE_LLM_TIMEOUT", 30)),
            max_retries=1,
        )
    return _client


def response_text(message) -> str:
    """Ghép các block text, bỏ qua thinking/fallback block."""
    return "".join(b.text for b in message.content if getattr(b, "type", None) == "text").strip()
