# Token giả lập token MagerLife ký cho MindSpace (xem src/server/mindspaceToken.mjs).
# Import TRƯỚC `import app`: app đọc MINDSPACE_SHARED_SECRET lúc import.
import os
from datetime import datetime, timedelta, timezone

import jwt

TEST_SECRET = "test-mindspace-secret-0123456789abcdef"
os.environ["MINDSPACE_SHARED_SECRET"] = TEST_SECRET


def mint(email: str, role: str = "user", *, aud: str = "mindspace", iss: str = "magerlife",
         ttl: timedelta = timedelta(hours=1), secret: str = TEST_SECRET, **extra) -> str:
    now = datetime.now(timezone.utc)
    claims = {"iss": iss, "aud": aud, "sub": email, "role": role, "iat": now, "exp": now + ttl if ttl else None, **extra}
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, secret, algorithm="HS256")


def auth_header(email: str, role: str = "user") -> dict:
    return {"Authorization": "Bearer " + mint(email, role)}
