# Test mã PIN khoá tab "Tâm sự". Chạy từ mindspace/: python tests/test_pin.py
import os
import sys
import types

sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.join(os.getcwd(), "tests"))
os.environ["DATABASE_URL"] = "sqlite://"
from _tokens import auth_header  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
import db.models as M  # noqa: E402


class FakePipeline:
    def __init__(self):
        self._engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        M.Base.metadata.create_all(self._engine)
    def get_greeting_if_returning(self, **k): return None


fake = types.ModuleType("pipeline"); fake.ChatbotPipeline = FakePipeline; sys.modules["pipeline"] = fake
import app as A  # noqa: E402
from core import pin as P  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

c = TestClient(A.app)
h = auth_header("pin@test.com")
uid = c.get("/api/auth/me", headers=h).json()["user_id"]
code = lambda r: (r.json().get("detail") or {}).get("code") if r.status_code >= 400 else None  # noqa: E731
GOOD, OTHER = "27183946", "40517283"
checks = []

# Băm
stored = P.hash_pin(GOOD)
checks.append(("hash không chứa PIN thô", GOOD not in stored and stored.startswith("scrypt$"), True))
checks.append(("hai lần băm khác salt", P.hash_pin(GOOD) != stored, True))
checks.append(("verify đúng", P.verify_pin(GOOD, stored), True))
checks.append(("verify sai", P.verify_pin(OTHER, stored), False))
for bad, why in (("1234567", "7 số"), ("123456789", "9 số"), ("1234567a", "có chữ"), ("11111111", "lặp"),
                 ("12345678", "dãy tăng"), ("98765432", "dãy giảm"), ("89012345", "dãy tăng vòng")):
    checks.append((f"từ chối PIN {why}", P.pin_problem(bad) is not None, True))
checks.append(("chấp nhận PIN thường", P.pin_problem(GOOD), None))

# Chưa đặt PIN: không đọc được hội thoại
r = c.get(f"/api/conversations/{uid}", headers=h)
checks.append(("chưa đặt PIN → 423 PIN_NOT_SET", (r.status_code, code(r)), (423, "PIN_NOT_SET")))
checks.append(("status chưa có PIN", c.get("/api/pin/status", headers=h).json()["has_pin"], False))
checks.append(("đặt PIN yếu bị từ chối", code(c.post("/api/pin/set", json={"pin": "00000000"}, headers=h)), "PIN_INVALID"))
checks.append(("không có token MagerLife → 401", c.get("/api/pin/status").status_code, 401))

# Đặt PIN
r = c.post("/api/pin/set", json={"pin": GOOD}, headers=h)
checks.append(("đặt PIN lần đầu", r.status_code, 200))
token = r.json()["unlock_token"]
u = {**h, "X-Mindspace-Unlock": token}
s = A._Session(); row = s.query(M.UserPin).filter(M.UserPin.user_id == uid).first(); s.close()
checks.append(("DB chỉ lưu bản băm", GOOD not in row.pin_hash and P.verify_pin(GOOD, row.pin_hash), True))
checks.append(("có mã mở khoá → đọc được", c.get(f"/api/conversations/{uid}", headers=u).status_code, 200))
r = c.get(f"/api/conversations/{uid}", headers=h)
checks.append(("thiếu mã mở khoá → 423 PIN_REQUIRED", (r.status_code, code(r)), (423, "PIN_REQUIRED")))
checks.append(("mã mở khoá giả → 423", c.get(f"/api/conversations/{uid}", headers={**h, "X-Mindspace-Unlock": "x.y.z"}).status_code, 423))
checks.append(("chat bị chặn khi chưa mở", c.post("/api/chat", json={"user_id": uid, "conversation_id": "x", "message": "hi"}, headers=h).status_code, 423))

# Mã mở khoá của người khác không dùng được
h2 = auth_header("other@test.com"); uid2 = c.get("/api/auth/me", headers=h2).json()["user_id"]
c.post("/api/pin/set", json={"pin": OTHER}, headers=h2)
checks.append(("mã mở khoá của A không mở được B", c.get(f"/api/conversations/{uid2}", headers={**h2, "X-Mindspace-Unlock": token}).status_code, 423))

# Đặt lại PIN khi đã có: phải kèm PIN hiện tại
checks.append(("đổi PIN không kèm PIN cũ", code(c.post("/api/pin/set", json={"pin": "59263148"}, headers=h)), "PIN_INCORRECT"))
c.post("/api/pin/verify", json={"pin": GOOD}, headers=h)      # reset đếm sai

# Nhập sai: đếm lùi rồi khoá
r = c.post("/api/pin/verify", json={"pin": OTHER}, headers=h)
checks.append(("sai lần 1", (r.status_code, r.json()["detail"].get("attempts_left")), (403, P.MAX_FAILED - 1)))
for _ in range(P.MAX_FAILED - 2):
    c.post("/api/pin/verify", json={"pin": OTHER}, headers=h)
r = c.post("/api/pin/verify", json={"pin": OTHER}, headers=h)
checks.append(("sai đủ lần → khoá", (r.status_code, code(r)), (429, "PIN_LOCKED")))
r = c.post("/api/pin/verify", json={"pin": GOOD}, headers=h)
checks.append(("đang khoá thì PIN đúng cũng bị chặn", code(r), "PIN_LOCKED"))
checks.append(("status báo đang khoá", c.get("/api/pin/status", headers=h).json()["locked"], True))
s = A._Session(); row = s.query(M.UserPin).filter(M.UserPin.user_id == uid).first(); row.locked_until = None; s.commit(); s.close()

# Đổi PIN: mã mở khoá cũ hết hiệu lực
r = c.post("/api/pin/set", json={"pin": "59263148", "current_pin": GOOD}, headers=h)
checks.append(("đổi PIN với PIN cũ đúng", r.status_code, 200))
checks.append(("mã mở khoá cũ hết hiệu lực sau khi đổi", c.get(f"/api/conversations/{uid}", headers=u).status_code, 423))
checks.append(("PIN cũ không mở được nữa", code(c.post("/api/pin/verify", json={"pin": GOOD}, headers=h)), "PIN_INCORRECT"))
r = c.post("/api/pin/verify", json={"pin": "59263148"}, headers=h)
checks.append(("PIN mới mở được", c.get(f"/api/conversations/{uid}", headers={**h, "X-Mindspace-Unlock": r.json()["unlock_token"]}).status_code, 200))
checks.append(("auth/me không cần PIN", c.get("/api/auth/me", headers=h).status_code, 200))

fail = 0
for name, got, want in checks:
    ok = got == want; fail += not ok
    print(("PASS " if ok else "FAIL ") + f"{name}: {got}")
print("failures:", fail)
