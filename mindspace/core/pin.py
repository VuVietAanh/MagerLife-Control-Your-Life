# ============================================================
# core/pin.py — Mã PIN 8 số khoá tab "Tâm sự"
#
# - PIN không bao giờ được lưu dạng thô: chỉ lưu scrypt(PIN, salt ngẫu nhiên 16 byte).
#   Định dạng: scrypt$<n>$<r>$<p>$<salt base64>$<hash base64>.
# - PIN chỉ có 10^8 khả năng, nên chống dò dựa vào: scrypt tốn công (n=2^15),
#   khoá tạm sau MAX_FAILED lần sai, và chặn PIN quá dễ đoán (lặp, dãy liên tiếp).
# - Nhập đúng PIN → mã mở khoá (JWT) hạn UNLOCK_TTL. Mã gắn với phiên bản PIN (pv),
#   nên đổi PIN thì mọi mã mở khoá cũ hết hiệu lực.
# ============================================================

import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

import jwt

PIN_LENGTH   = 8
MAX_FAILED   = 5
LOCK_MINUTES = 15
UNLOCK_TTL   = timedelta(minutes=30)

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2 ** 15, 8, 1
_SCRYPT_MAXMEM = 64 * 1024 * 1024
_UNLOCK_AUD, _UNLOCK_ISS = "mindspace-unlock", "mindspace"
_PIN_RE = re.compile(rf"^\d{{{PIN_LENGTH}}}$")


def pin_problem(pin: str) -> str | None:
    """Lý do PIN không dùng được, hoặc None nếu dùng được."""
    if not isinstance(pin, str) or not _PIN_RE.match(pin):
        return f"Mã phải gồm đúng {PIN_LENGTH} chữ số."
    if len(set(pin)) == 1:
        return "Mã quá dễ đoán (toàn một chữ số). Chọn mã khác."
    digits = [int(c) for c in pin]
    steps = {(b - a) % 10 for a, b in zip(digits, digits[1:])}
    if steps in ({1}, {9}):
        return "Mã quá dễ đoán (dãy số liên tiếp). Chọn mã khác."
    return None


def _scrypt(pin: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(pin.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=_SCRYPT_MAXMEM, dklen=32)


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(pin, salt, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P)
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${b64(salt)}${b64(digest)}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        actual = _scrypt(pin, base64.b64decode(salt_b64), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def pin_version(updated_at: datetime) -> int:
    return int(updated_at.replace(tzinfo=timezone.utc).timestamp() * 1000)


def make_unlock_token(secret: str, user_id: str, version: int) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    claims = {"iss": _UNLOCK_ISS, "aud": _UNLOCK_AUD, "sub": user_id, "pv": version,
              "iat": now, "exp": now + UNLOCK_TTL}
    return jwt.encode(claims, secret, algorithm="HS256"), int(UNLOCK_TTL.total_seconds())


def check_unlock_token(secret: str, token: str | None, user_id: str, version: int) -> bool:
    if not token:
        return False
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=_UNLOCK_AUD, issuer=_UNLOCK_ISS,
                            options={"require": ["exp", "iat", "sub", "aud", "iss"]})
    except jwt.PyJWTError:
        return False
    return claims.get("sub") == user_id and claims.get("pv") == version
