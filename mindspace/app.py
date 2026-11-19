# ============================================================
# app.py — Main FastAPI app (Vercel)
# Full API matching frontend routes
# ============================================================

import os
import secrets
from datetime import datetime, timedelta

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()

app = FastAPI(title="MindSpace Chatbot API")

# Chỉ frontend MagerLife được gọi từ trình duyệt. Token đi qua header Authorization,
# không dùng cookie, nên không cần allow_credentials.
_CORS_ORIGINS = [o.strip() for o in os.getenv("MINDSPACE_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Mindspace-Unlock"],
)


@app.middleware("http")
async def _no_store(request, call_next):
    # Tin nhắn tâm sự không được nằm trong cache nào (Vercel CDN cache theo header của upstream).
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

# ── Pipeline (khởi tạo 1 lần) ───────────────────────────────
from pipeline import ChatbotPipeline

_pipeline = ChatbotPipeline()
_Session  = sessionmaker(bind=_pipeline._engine)

def get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()

# ── Đăng nhập: chỉ qua MagerLife ────────────────────────────
# MindSpace không có trang đăng nhập. Frontend MagerLife đổi phiên đang đăng nhập lấy một JWT
# ngắn hạn (POST /api/mindspace/token phía Node), ký bằng MINDSPACE_SHARED_SECRET. Ở đây chỉ
# kiểm tra chữ ký, iss, aud, hạn; rồi tìm user theo email (tạo mới ở lần đầu).
import jwt
from sqlalchemy.exc import IntegrityError

_SHARED_SECRET = os.getenv("MINDSPACE_SHARED_SECRET", "")
if len(_SHARED_SECRET) < 32:
    # Secret ngẫu nhiên: không token nào hợp lệ, mọi request có xác thực đều 401.
    print("⚠️  MINDSPACE_SHARED_SECRET missing or shorter than 32 characters — every authenticated request will get 401")
    _SHARED_SECRET = secrets.token_hex(32)


def _decode_token(token: str) -> dict | None:
    try:
        claims = jwt.decode(token, _SHARED_SECRET, algorithms=["HS256"], audience="mindspace",
                            issuer="magerlife", options={"require": ["exp", "iat", "sub", "aud", "iss"]})
    except jwt.PyJWTError:
        return None
    email = str(claims.get("sub") or "").strip().lower()
    return {"email": email, "role": "admin" if claims.get("role") == "admin" else "user"} if email else None


def _user_for_claims(db: Session, claims: dict):
    """User ứng với email trong token. Role luôn lấy theo MagerLife (MAGERLIFE_ADMIN_EMAILS)."""
    from db.crud import create_user, get_user_by_email
    user = get_user_by_email(db, claims["email"])
    if not user:
        try:
            user = create_user(db, email=claims["email"], role=claims["role"], language="vi")
        except IntegrityError:          # hai request đầu tiên chạy song song
            db.rollback()
            user = get_user_by_email(db, claims["email"])
    elif user.role != claims["role"]:
        user.role = claims["role"]
        db.commit()
    return user


def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    claims = _decode_token(authorization.split(" ", 1)[1])
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = _user_for_claims(db, claims)
    # Admin MindSpace có thể khóa tài khoản: có hiệu lực ngay, dù token còn hạn
    if not user or user.is_active is False:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user.user_id

def _require_self(token_user_id: str, claimed_user_id: str | None):
    """Body/path user_id phải trùng với user của token."""
    if claimed_user_id and claimed_user_id != token_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

# ── PIN khoá tab "Tâm sự" (core/pin.py) ────────────────────
# Mọi endpoint đọc/ghi hội thoại đòi header X-Mindspace-Unlock: mã mở khoá cấp sau khi nhập
# đúng PIN. Chưa đặt PIN thì phải đặt trước, nên không có đường nào đọc hội thoại mà bỏ qua PIN.
from core import pin as pin_lib


def _pin_error(status: int, code: str, message: str, **extra):
    raise HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


def _get_pin(db: Session, user_id: str):
    from db.models import UserPin
    return db.query(UserPin).filter(UserPin.user_id == user_id).first()


def _check_pin_attempt(db: Session, record, pin: str) -> None:
    """Kiểm tra PIN, đếm lần sai và khoá tạm. Raise nếu sai hoặc đang bị khoá."""
    now = datetime.utcnow()
    if record.locked_until and record.locked_until > now:
        retry = int((record.locked_until - now).total_seconds()) + 1
        _pin_error(429, "PIN_LOCKED", f"Nhập sai quá nhiều lần. Thử lại sau {max(1, retry // 60)} phút.",
                   retry_after=retry)
    if pin_lib.verify_pin(pin or "", record.pin_hash):
        record.failed_attempts, record.locked_until = 0, None
        db.commit()
        return
    record.failed_attempts = (record.failed_attempts or 0) + 1
    if record.failed_attempts >= pin_lib.MAX_FAILED:
        record.failed_attempts = 0
        record.locked_until = now + timedelta(minutes=pin_lib.LOCK_MINUTES)
        db.commit()
        _pin_error(429, "PIN_LOCKED", f"Nhập sai {pin_lib.MAX_FAILED} lần. Tâm sự bị khoá {pin_lib.LOCK_MINUTES} phút.",
                   retry_after=pin_lib.LOCK_MINUTES * 60)
    db.commit()
    left = pin_lib.MAX_FAILED - record.failed_attempts
    _pin_error(403, "PIN_INCORRECT", f"Mã không đúng. Còn {left} lần thử.", attempts_left=left)


def _unlock_response(record) -> dict:
    token, ttl = pin_lib.make_unlock_token(_SHARED_SECRET, record.user_id, pin_lib.pin_version(record.updated_at))
    return {"unlock_token": token, "expires_in": ttl}


def get_unlocked_user(auth_uid: str = Depends(get_current_user),
                      x_mindspace_unlock: str = Header(None),
                      db: Session = Depends(get_db)):
    record = _get_pin(db, auth_uid)
    if not record:
        _pin_error(423, "PIN_NOT_SET", "Cần đặt mã PIN trước khi dùng Tâm sự.")
    if not pin_lib.check_unlock_token(_SHARED_SECRET, x_mindspace_unlock, auth_uid,
                                      pin_lib.pin_version(record.updated_at)):
        _pin_error(423, "PIN_REQUIRED", "Nhập mã PIN để mở Tâm sự.")
    return auth_uid


class SetPinRequest(BaseModel):
    pin: str
    current_pin: str | None = None


class VerifyPinRequest(BaseModel):
    pin: str


@app.get("/api/pin/status")
def pin_status(auth_uid: str = Depends(get_current_user), db: Session = Depends(get_db)):
    record = _get_pin(db, auth_uid)
    locked = bool(record and record.locked_until and record.locked_until > datetime.utcnow())
    return {"has_pin": record is not None, "locked": locked, "pin_length": pin_lib.PIN_LENGTH}


@app.post("/api/pin/set")
def pin_set(req: SetPinRequest, auth_uid: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Đặt PIN lần đầu, hoặc đổi PIN (phải kèm PIN hiện tại)."""
    from db.models import UserPin
    problem = pin_lib.pin_problem(req.pin)
    if problem:
        _pin_error(400, "PIN_INVALID", problem)
    record = _get_pin(db, auth_uid)
    if record:
        _check_pin_attempt(db, record, req.current_pin or "")
        record.pin_hash = pin_lib.hash_pin(req.pin)
    else:
        record = UserPin(user_id=auth_uid, pin_hash=pin_lib.hash_pin(req.pin), failed_attempts=0)
        db.add(record)
    record.updated_at = datetime.utcnow()
    try:
        db.commit()
    except IntegrityError:          # hai lần đặt PIN đầu tiên chạy song song
        db.rollback()
        _pin_error(409, "PIN_ALREADY_SET", "Mã PIN vừa được đặt ở nơi khác. Tải lại trang.")
    db.refresh(record)
    return _unlock_response(record)


@app.post("/api/pin/verify")
def pin_verify(req: VerifyPinRequest, auth_uid: str = Depends(get_current_user), db: Session = Depends(get_db)):
    record = _get_pin(db, auth_uid)
    if not record:
        _pin_error(423, "PIN_NOT_SET", "Cần đặt mã PIN trước khi dùng Tâm sự.")
    _check_pin_attempt(db, record, req.pin)
    return _unlock_response(record)


def _returning_prompt(db: Session, prev) -> str:
    """Lời mời nói tiếp khi người dùng mở cuộc trò chuyện mới.

    Tên cuộc trò chuyện được lấy từ tin đầu tiên, nên với cuộc có tín hiệu tự hại
    thì không nhắc lại tên đó (tránh dội lại nguyên văn câu đau lòng của họ)."""
    from db.models import Message
    had_crisis = db.query(Message).filter(Message.conversation_id == prev.conversation_id,
                                          Message.crisis_flagged == True).first() is not None  # noqa: E712
    name = (prev.name_conversation or "").strip()
    if had_crisis or not name or name == "New conversation":
        return "Chào bạn quay lại. Bạn muốn nói tiếp chuyện lần trước, hay bắt đầu chuyện mới?"
    return f"Chào bạn quay lại. Lần trước mình nói về **{name}**. Bạn muốn nói tiếp, hay bắt đầu chuyện mới?"


def _require_conversation(db: Session, conversation_id: str, user_id: str,
                          allow_admin: bool = False):
    """Conversation phải thuộc user của token (admin được đọc nếu allow_admin)."""
    from db.crud import get_user
    from db.models import Conversation
    conv = db.query(Conversation).filter(
        Conversation.conversation_id == conversation_id
    ).first()
    if conv and conv.user_id == user_id:
        return conv
    if conv and allow_admin:
        user = get_user(db, user_id)
        if user and user.role == "admin":
            return conv
    # 404 cho cả trường hợp không có quyền, để không lộ conversation nào tồn tại
    raise HTTPException(status_code=404, detail="Conversation not found")


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class ProfileUpdateRequest(BaseModel):
    name:          str  | None = None
    age:           int  | None = None
    gender:        str  | None = None
    date_of_birth: str  | None = None

class ChatRequest(BaseModel):
    user_id:         str
    conversation_id: str
    message:         str

class NewConvRequest(BaseModel):
    user_id: str

class RenameRequest(BaseModel):
    name: str

class CarryOverRequest(BaseModel):
    user_id:                str
    source_conversation_id: str

class EndRequest(BaseModel):
    conversation_id: str


# ============================================================
# AUTH ROUTES
# ============================================================

# Không có đăng ký hay đăng nhập riêng: tài khoản là tài khoản MagerLife (xem get_current_user).


@app.get("/api/auth/me")
def me(user_id: str = Depends(get_current_user), db: Session = Depends(get_db)):
    from db.crud import get_user
    user = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user.user_id, "name": user.name, "email": user.email,
            "role": user.role, "age": user.age, "gender": user.gender,
            "date_of_birth": str(user.date_of_birth) if user.date_of_birth else None}


@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdateRequest,
                   user_id: str = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    from datetime import date

    from db.crud import update_user_profile
    dob = None
    if req.date_of_birth:
        try:
            dob = date.fromisoformat(req.date_of_birth)
        except ValueError:
            pass
    update_user_profile(db, user_id, name=req.name, age=req.age,
                        gender=req.gender, date_of_birth=dob)
    return {"status": "updated"}


# ============================================================
# BACKGROUNDS
# ============================================================

@app.get("/api/backgrounds")
def backgrounds():
    folder = "static/backgrounds"
    if not os.path.exists(folder):
        return {"images": []}
    images = [f for f in os.listdir(folder)
              if f.lower().endswith(('.jpg','.jpeg','.png','.webp'))]
    return {"images": images}


# ============================================================
# SESSION START
# ============================================================

# ============================================================
# CHAT
# ============================================================

@app.post("/api/chat")
def chat(req: ChatRequest, auth_uid: str = Depends(get_unlocked_user),
         db: Session = Depends(get_db)):
    from db.crud import update_conversation_emotion
    _require_self(auth_uid, req.user_id)
    _require_conversation(db, req.conversation_id, auth_uid)
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    result = _pipeline.process(
        user_input=req.message,
        user_id=req.user_id,
        conversation_id=req.conversation_id,
    )

    # Cảm xúc theo từng hội thoại: dùng lại điểm pipeline vừa tính,
    # không gọi phân tích lần hai.
    if result.emotion_method == "claude":
        update_conversation_emotion(db, req.conversation_id, result.emotion_scores)

    return {
        "response":         result.response,
        "crisis_level":     result.crisis_level,
        "dominant_emotion": result.dominant_emotion,
        "was_flagged":      result.was_flagged,
        "intent":           result.intent,
        "high_emotion":     result.high_emotion,
    }


# ============================================================
# CONVERSATIONS
# ============================================================

def _iso(dt):
    """Giờ UTC dạng ISO có 'Z' để frontend tự đổi sang giờ Việt Nam."""
    return dt.replace(microsecond=0).isoformat() + "Z" if dt else None


def _latest_empty_conversation(db: Session, user_id: str):
    from db.models import Conversation, Message
    has_msg = db.query(Message.message_id).filter(Message.conversation_id == Conversation.conversation_id).exists()
    return (db.query(Conversation).filter(Conversation.user_id == user_id, ~has_msg)
            .order_by(Conversation.started_at.desc()).first())


@app.post("/api/conversation/new")
def new_conversation(req: NewConvRequest, auth_uid: str = Depends(get_unlocked_user),
                     db: Session = Depends(get_db)):
    from db.crud import create_conversation, get_recent_conversations, purge_expired_conversations
    _require_self(auth_uid, req.user_id)
    purge_expired_conversations(db)   # mặc định giữ mãi; chỉ xoá khi đặt MINDSPACE_RETENTION_DAYS

    # Mở tab Tâm sự nhiều lần không sinh thêm cuộc trống: dùng lại cuộc trống gần nhất
    conv    = _latest_empty_conversation(db, req.user_id) or create_conversation(db, user_id=req.user_id)
    recent  = get_recent_conversations(db, req.user_id, limit=3)
    prev    = [c for c in recent if c.conversation_id != conv.conversation_id]

    returning_prompt     = None
    prev_conversation_id = None
    if prev:
        returning_prompt     = _returning_prompt(db, prev[0])
        prev_conversation_id = prev[0].conversation_id

    greeting = _pipeline.get_greeting_if_returning(
        session=db, user_id=req.user_id, name=None
    ) if not returning_prompt else None

    return {
        "conversation_id":      conv.conversation_id,
        "greeting":             greeting,
        "returning_prompt":     returning_prompt,
        "prev_conversation_id": prev_conversation_id,
    }


@app.get("/api/conversations/{user_id}")
def get_conversations(user_id: str, auth_uid: str = Depends(get_unlocked_user),
                      db: Session = Depends(get_db)):
    from sqlalchemy import func

    from db.models import Conversation, Message
    _require_self(auth_uid, user_id)
    rows = (
        db.query(Conversation, func.count(Message.message_id), func.max(Message.timestamp))
        .outerjoin(Message, Message.conversation_id == Conversation.conversation_id)
        .filter(Conversation.user_id == user_id)
        .group_by(Conversation.conversation_id)
        .all()
    )
    rows.sort(key=lambda r: r[2] or r[0].started_at, reverse=True)   # cuộc vừa nhắn lên đầu
    return [
        {
            "conversation_id":   c.conversation_id,
            "name_conversation": c.name_conversation if c.name_conversation not in (None, "", "New conversation") else None,
            "message_count":     n,
            "started_at":        _iso(c.started_at),
            "last_message_at":   _iso(last),
            "ended_at":          _iso(c.ended_at),
        }
        for c, n, last in rows
    ]


@app.get("/api/conversation/{conversation_id}/messages")
def get_messages(conversation_id: str, auth_uid: str = Depends(get_unlocked_user),
                 db: Session = Depends(get_db)):
    from db.crud import get_recent_messages
    _require_conversation(db, conversation_id, auth_uid, allow_admin=True)
    msgs = list(reversed(get_recent_messages(db, conversation_id, limit=100)))
    result = []
    for m in msgs:
        if m.user_input:
            result.append({"role": "user", "content": m.user_input,
                           "timestamp": _iso(m.timestamp)})
        if m.bot_response:
            result.append({"role": "bot", "content": m.bot_response,
                           "timestamp": _iso(m.timestamp), "crisis_flagged": bool(m.crisis_flagged)})
    return result


@app.put("/api/conversation/{conversation_id}/rename")
def rename_conversation(conversation_id: str, req: RenameRequest,
                        auth_uid: str = Depends(get_unlocked_user),
                        db: Session = Depends(get_db)):
    conv = _require_conversation(db, conversation_id, auth_uid)
    conv.name_conversation = req.name[:80]
    db.commit()
    return {"conversation_id": conversation_id, "name": conv.name_conversation}


@app.delete("/api/conversation/{conversation_id}")
def delete_conversation(conversation_id: str, auth_uid: str = Depends(get_unlocked_user),
                        db: Session = Depends(get_db)):
    from db.crud import delete_conversation as _delete
    _require_conversation(db, conversation_id, auth_uid)
    ok = _delete(db, conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}


@app.post("/api/conversation/carry-over")
def carry_over(req: CarryOverRequest, auth_uid: str = Depends(get_unlocked_user),
               db: Session = Depends(get_db)):
    from db.crud import carry_over_emotion_from_conversation
    _require_self(auth_uid, req.user_id)
    _require_conversation(db, req.source_conversation_id, auth_uid)
    carry_over_emotion_from_conversation(db, req.user_id, req.source_conversation_id)
    return {"status": "carried_over"}


@app.post("/api/end/{conversation_id}")
def end_session(conversation_id: str, auth_uid: str = Depends(get_unlocked_user),
                db: Session = Depends(get_db)):
    _require_conversation(db, conversation_id, auth_uid)
    _pipeline.end_session(conversation_id)
    return {"status": "ended"}

# Admin: email nằm trong MAGERLIFE_ADMIN_EMAILS phía MagerLife (role đi theo token).

# ============================================================
# EMOTION
# ============================================================

@app.get("/api/emotion/conversation/{conversation_id}")
def emotion_conversation(conversation_id: str, auth_uid: str = Depends(get_unlocked_user),
                         db: Session = Depends(get_db)):
    from db.crud import get_conversation_emotion
    _require_conversation(db, conversation_id, auth_uid, allow_admin=True)
    ce = get_conversation_emotion(db, conversation_id)
    if not ce:
        return {"scores": {}, "dominant_emotion": None}
    EMOTIONS = ["anger","disgust","fear","joy","sadness","surprise","trust","anticipation"]
    return {
        "scores":           {e: getattr(ce, e, 0.0) for e in EMOTIONS},
        "dominant_emotion": ce.dominant_emotion,
        "turn_count":       ce.turn_count,
    }


# ============================================================
# ADMIN ROUTES
# ============================================================

def require_admin(user_id: str = Depends(get_unlocked_user),
                  db: Session = Depends(get_db)):
    from db.crud import get_user
    user = get_user(db, user_id)
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user_id


@app.get("/api/admin/stats")
def admin_stats(admin: str = Depends(require_admin), db: Session = Depends(get_db)):
    from db.crud import (get_active_user_count, get_conversation_count,
                         get_user_count)
    from db.models import Message
    crisis_count = db.query(Message).filter(Message.crisis_flagged == True).count()
    return {
        "total_users":        get_user_count(db),
        "active_users":       get_active_user_count(db),
        "total_conversations": get_conversation_count(db),
        "crisis_messages":    crisis_count,
    }


@app.get("/api/admin/users")
def admin_users(limit: int = 200, admin: str = Depends(require_admin),
                db: Session = Depends(get_db)):
    from db.crud import get_all_users
    from db.models import Conversation
    users = get_all_users(db, limit=limit)
    result = []
    for u in users:
        conv_count = db.query(Conversation).filter(Conversation.user_id == u.user_id).count()
        result.append({
            "user_id":           u.user_id,
            "name":              u.name,
            "email":             u.email,
            "age":               u.age,
            "gender":            u.gender,
            "date_of_birth":     str(u.date_of_birth) if u.date_of_birth else None,
            "is_active":         u.is_active,
            "role":              u.role,
            "conversation_count": conv_count,
            "created_at":        u.created_at.isoformat() if u.created_at else None,
            "last_active":       u.last_active.isoformat() if u.last_active else None,
        })
    return result


@app.patch("/api/admin/users/{user_id}/toggle-active")
def toggle_user(user_id: str, admin: str = Depends(require_admin),
                db: Session = Depends(get_db)):
    from db.crud import get_user
    user = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"user_id": user_id, "is_active": user.is_active}


@app.get("/api/admin/users/{user_id}/detail")
def admin_user_detail(user_id: str, admin: str = Depends(require_admin),
                      db: Session = Depends(get_db)):
    from db.crud import get_conversation_emotion, get_emotion_state, get_user
    from db.models import Conversation, Message

    user  = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    state   = get_emotion_state(db, user_id)
    EMOTIONS = ["anger","disgust","fear","joy","sadness","surprise","trust","anticipation"]

    convs = (db.query(Conversation).filter(Conversation.user_id == user_id)
             .order_by(Conversation.started_at.desc()).all())
    convs_data = []
    for c in convs:
        msg_count = db.query(Message).filter(Message.conversation_id == c.conversation_id).count()
        crisis_c  = db.query(Message).filter(Message.conversation_id == c.conversation_id,
                                              Message.crisis_flagged == True).count()
        ce = get_conversation_emotion(db, c.conversation_id)
        convs_data.append({
            "conversation_id":   c.conversation_id,
            "name_conversation": c.name_conversation,
            "message_count":     msg_count,
            "crisis_count":      crisis_c,
            "dominant_emotion":  ce.dominant_emotion if ce else None,
            "emotion_scores":    {e: getattr(ce, e, 0.0) for e in EMOTIONS} if ce else {},
            "started_at":        c.started_at.isoformat() if c.started_at else None,
            "ended_at":          c.ended_at.isoformat() if c.ended_at else None,
        })

    return {
        "user_id":      user.user_id,
        "name":         user.name,
        "email":        user.email,
        "age":          user.age,
        "gender":       user.gender,
        "date_of_birth": str(user.date_of_birth) if user.date_of_birth else None,
        "is_active":    user.is_active,
        "created_at":   user.created_at.isoformat() if user.created_at else None,
        "last_active":  user.last_active.isoformat() if user.last_active else None,
        "global_emotion": {
            "scores":       {e: getattr(state, e, 0.0) for e in EMOTIONS} if state else {},
            "dominant":     state.dominant_emotion if state else None,
            "turn_count":   state.turn_count if state else 0,
            "crisis_flag":  state.crisis_flag if state else False,
        },
        "conversations": convs_data,
    }


@app.get("/api/admin/conversations")
def admin_conversations(limit: int = 200, admin: str = Depends(require_admin),
                        db: Session = Depends(get_db)):
    from db.models import Conversation, ConversationEmotion, Message, User

    convs = (db.query(Conversation)
             .order_by(Conversation.started_at.desc())
             .limit(limit).all())
    result = []
    for c in convs:
        user      = db.query(User).filter(User.user_id == c.user_id).first()
        msg_count = db.query(Message).filter(Message.conversation_id == c.conversation_id).count()
        crisis_c  = db.query(Message).filter(Message.conversation_id == c.conversation_id,
                                              Message.crisis_flagged == True).count()
        ce = db.query(ConversationEmotion).filter(
            ConversationEmotion.conversation_id == c.conversation_id
        ).first()
        result.append({
            "conversation_id":   c.conversation_id,
            "name_conversation": c.name_conversation,
            "user_name":         user.name if user else None,
            "user_email":        user.email if user else None,
            "message_count":     msg_count,
            "crisis_count":      crisis_c,
            "dominant_emotion":  ce.dominant_emotion if ce else None,
            "started_at":        c.started_at.isoformat() if c.started_at else None,
            "ended_at":          c.ended_at.isoformat() if c.ended_at else None,
        })
    return result


# ============================================================
# HEALTH + STATIC FILES
# ============================================================

@app.get("/health")
def health():
    return {"status": "ok"}


if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def root():
    # Giao diện nằm trong MagerLife (tab "Tâm sự"); service này chỉ là API.
    return {"status": "ok", "message": "MindSpace API running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", 8001)))