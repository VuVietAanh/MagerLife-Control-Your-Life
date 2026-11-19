# Test phân quyền + JWT với pipeline giả. Chạy từ mindspace/: python tests/test_auth.py
import sys, types, os
sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.join(os.getcwd(), "tests"))
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["MINDSPACE_CORS_ORIGINS"] = "https://magerlife.test"
from _tokens import TEST_SECRET, auth_header, mint, unlocked
from db.models import init_db
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine
import db.models as M
class FakeResult:
    response="ok"; crisis_level="none"; dominant_emotion="neutral"; was_flagged=False; intent="neutral"; high_emotion=None
    emotion_method="claude"; emotion_scores={e: 0.0 for e in ["anger","disgust","fear","joy","sadness","surprise","trust","anticipation"]}
class FakePipeline:
    def __init__(self):
        self._engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        M.Base.metadata.create_all(self._engine)
        self._emotion_analyzer = None
    def get_greeting_if_returning(self, **k): return None
    def process(self, **k):
        from sqlalchemy.orm import Session as _S
        from db.crud import save_message
        with _S(self._engine) as s: save_message(s, k["conversation_id"], k["user_input"], "ok")
        return FakeResult()
    def end_session(self, cid): pass
fake = types.ModuleType("pipeline"); fake.ChatbotPipeline = FakePipeline; sys.modules["pipeline"] = fake
import app as A
from fastapi.testclient import TestClient
c = TestClient(A.app)
def reg(email):
    # Lần đầu gọi với token MagerLife hợp lệ thì MindSpace tự tạo user theo email
    h = auth_header(email)
    r = c.get("/api/auth/me", headers=h); r.raise_for_status()
    return r.json()["user_id"], unlocked(c, h)
a_id,a_h = reg("a@test.com"); b_id,b_h = reg("b@test.com")
conv = c.post("/api/conversation/new", json={"user_id":a_id}, headers=a_h).json()["conversation_id"]
checks = [
 ("register gone",                 c.post("/api/auth/register", json={"name":"x","email":"z@test.com","password":"Passw0rd!"}).status_code, 404),
 ("password login gone",          c.post("/api/auth/login", json={"email":"a@test.com","password":"Passw0rd!"}).status_code, 404),
 ("setup/create-admin gone",       c.post("/api/setup/create-admin", json={}).status_code, 404),
 ("chat no token",                 c.post("/api/chat", json={"user_id":a_id,"conversation_id":conv,"message":"hi"}).status_code, 401),
 ("chat owner",                    c.post("/api/chat", json={"user_id":a_id,"conversation_id":conv,"message":"hi"}, headers=a_h).status_code, 200),
 ("chat B spoofs A",               c.post("/api/chat", json={"user_id":a_id,"conversation_id":conv,"message":"hi"}, headers=b_h).status_code, 403),
 ("chat B own id, A conv",         c.post("/api/chat", json={"user_id":b_id,"conversation_id":conv,"message":"hi"}, headers=b_h).status_code, 404),
 ("messages no token",             c.get(f"/api/conversation/{conv}/messages").status_code, 401),
 ("messages B reads A",            c.get(f"/api/conversation/{conv}/messages", headers=b_h).status_code, 404),
 ("messages owner",                c.get(f"/api/conversation/{conv}/messages", headers=a_h).status_code, 200),
 ("list A convs as B",             c.get(f"/api/conversations/{a_id}", headers=b_h).status_code, 403),
 ("emotion B reads A",             c.get(f"/api/emotion/conversation/{conv}", headers=b_h).status_code, 404),
 ("rename B",                      c.put(f"/api/conversation/{conv}/rename", json={"name":"x"}, headers=b_h).status_code, 404),
 ("delete B",                      c.delete(f"/api/conversation/{conv}", headers=b_h).status_code, 404),
 ("end B",                         c.post(f"/api/end/{conv}", headers=b_h).status_code, 404),
 ("start route gone",              c.post("/api/start", json={"user_id":a_id}, headers=a_h).status_code, 404),
 ("confirm-identity gone",         c.post("/api/confirm-identity", json={}, headers=a_h).status_code, 404),
 ("new conv B for A",              c.post("/api/conversation/new", json={"user_id":a_id}, headers=b_h).status_code, 403),
 ("carry-over B from A",           c.post("/api/conversation/carry-over", json={"user_id":b_id,"source_conversation_id":conv}, headers=b_h).status_code, 404),
]
# admin may read
from db.crud import get_user_by_email
b_h = unlocked(c, auth_header("b@test.com", role="admin"))   # role lấy từ token MagerLife
checks.append(("admin reads messages", c.get(f"/api/conversation/{conv}/messages", headers=b_h).status_code, 200))
checks.append(("admin cannot delete",  c.delete(f"/api/conversation/{conv}", headers=b_h).status_code, 404))
lst = c.get(f"/api/conversations/{a_id}", headers=a_h)
checks.append(("api responses not cacheable", lst.headers.get("cache-control"), "no-store"))
row = next(r for r in lst.json() if r["conversation_id"] == conv)
checks.append(("list has ISO times + count", (row["started_at"].endswith("Z"), row["message_count"]), (True, 1)))
e_id, e_h = reg("e@test.com")
e1 = c.post("/api/conversation/new", json={"user_id":e_id}, headers=e_h).json()["conversation_id"]
checks.append(("new reuses empty conv", c.post("/api/conversation/new", json={"user_id":e_id}, headers=e_h).json()["conversation_id"], e1))
m = c.get(f"/api/conversation/{conv}/messages", headers=a_h).json()
checks.append(("message timestamp ISO", m[0]["timestamp"].endswith("Z") and "T" in m[0]["timestamp"], True))
conv2 = c.post("/api/conversation/new", json={"user_id":a_id}, headers=a_h).json()["conversation_id"]
checks.append(("new after messages = new conv", conv2 != conv, True))
checks.append(("owner delete",         c.delete(f"/api/conversation/{conv}", headers=a_h).status_code, 200))
fail=0
for n,got,exp in checks:
    ok = got==exp; fail += not ok; print(("PASS" if ok else "FAIL"), n, got)
print("failures:", fail)
# ── Token MagerLife ──
import datetime as dt
import jwt as J
from db.crud import get_user as gu
def me(token): return c.get("/api/auth/me", headers={"Authorization": "Bearer " + token})
fresh = mint("a@test.com")
checks2 = [
 ("valid token",                         me(fresh).status_code, 200),
 ("email is case-insensitive",           me(mint("A@Test.com")).json().get("user_id"), a_id),
 ("first token auto-creates user",       me(mint("new@test.com")).status_code, 200),
 ("tampered token rejected",             me(fresh[:-2] + "xx").status_code, 401),
 ("wrong-secret token rejected",         me(mint("a@test.com", secret="x" * 40)).status_code, 401),
 ("expired token rejected",              me(mint("a@test.com", ttl=dt.timedelta(minutes=-1))).status_code, 401),
 ("wrong aud rejected",                  me(mint("a@test.com", aud="magerlife")).status_code, 401),
 ("wrong iss rejected",                  me(mint("a@test.com", iss="someone")).status_code, 401),
 ("missing exp rejected",                me(mint("a@test.com", ttl=None)).status_code, 401),
 ("alg=none rejected",                   me(J.encode({"iss":"magerlife","aud":"mindspace","sub":"a@test.com","iat":1,"exp":9999999999}, None, algorithm="none")).status_code, 401),
 ("raw MagerLife session token rejected", me("eyJzdWIiOiJhQHRlc3QuY29tIn0.c2ln").status_code, 401),
 ("CORS allows MagerLife origin",        c.options("/api/auth/me", headers={"Origin":"https://magerlife.test","Access-Control-Request-Method":"GET"}).headers.get("access-control-allow-origin"), "https://magerlife.test"),
 ("CORS refuses other origins",          c.options("/api/auth/me", headers={"Origin":"https://evil.test","Access-Control-Request-Method":"GET"}).headers.get("access-control-allow-origin"), None),
]
s = A._Session(); checks2.append(("role follows token (b demoted)", (me(mint("b@test.com")).status_code, gu(s, b_id).role), (200, "user"))); s.close()
s = A._Session(); u = gu(s, a_id); u.is_active=False; s.commit(); s.close()
checks2.append(("disabled user rejected", me(fresh).status_code, 401))
s = A._Session(); u = gu(s, a_id); u.is_active=None; s.commit(); s.close()
checks2.append(("legacy NULL is_active allowed", me(fresh).status_code, 200))
f2=0
for n,got,exp in checks2:
    ok = got==exp; f2 += not ok; print(("PASS" if ok else "FAIL"), n, got)
print("jwt failures:", f2)
