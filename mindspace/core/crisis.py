# ============================================================
# core/crisis.py
# Quyết định mức an toàn cho mỗi lượt
#
# Thay đổi so với bản cũ:
# - Tín hiệu chính là self_harm từ TurnAnalyzer, không phải điểm cảm xúc.
#     explicit  → CRITICAL (risk_mode "high")
#     ambiguous → ALERT    (risk_mode "watch": hỏi rõ / giữ cửa mở)
# - Buồn kéo dài, cảm xúc tiêu cực cao CHỈ lên WATCH (risk_mode "care"):
#   ấm hơn, chậm lại, KHÔNG chuyển sang giọng khủng hoảng. Trước đây
#   6 lượt buồn liên tiếp là CRITICAL → bot đổi sang giọng thủ tục với
#   một người chỉ đang buồn.
# - Bỏ rule "anger cao → ALERT" (không liên quan nguy cơ tự hại).
# - Sau một lượt ALERT/CRITICAL, lượt kế giữ WATCH (care) một lượt.
# - notify_system chỉ bật ở CRITICAL. Xem lại quyền riêng tư / sự đồng ý
#   của người dùng trước khi gửi thông báo đi bất cứ đâu.
# - Sửa test: ContextResult cũ thiếu recent_bot_responses → TypeError.
# - GIỮ MỨC CAO sau khi người dùng nói rõ ý tự hại: CRITICAL được giữ thêm
#   HIGH_HOLD_TURNS lượt, kể cả khi tin sau nghe nhẹ hơn ("chưa làm gì đâu",
#   "để mình gọi cho chị"). Hết giữ: thêm một lượt "care" rồi mới về none.
#   Trạng thái nằm trong DB (messages.crisis_flagged = lượt đó người dùng nói
#   rõ ý tự hại), nên không mất khi restart hay chạy nhiều worker / serverless.
# ============================================================

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

from sqlalchemy.orm import Session

from core.context import ContextResult
from core.keyword_filter import FilterResult, RiskLevel
from db.crud import get_emotion_state
from db.models import Conversation, Message


class CrisisLevel(str, Enum):
    NONE     = "none"
    WATCH    = "watch"     # buồn kéo dài → ấm hơn, không phải khủng hoảng
    ALERT    = "alert"     # câu mơ hồ / nửa vời về tự hại → hỏi rõ, giữ cửa mở
    CRITICAL = "critical"  # nói rõ ý muốn tự hại → hỏi an toàn, đường dây hỗ trợ


@dataclass
class CrisisResult:
    level:         CrisisLevel
    is_crisis:     bool          # chỉ True với ALERT/CRITICAL
    reasons:       list[str]
    action:        str
    notify_system: bool
    risk_mode:     str = "none"  # truyền thẳng vào Generator.generate(risk_mode=...)
    held:          bool = False  # True nếu CRITICAL do đang giữ mức sau một lượt explicit
    explicit_now:  bool = False  # lượt này có tín hiệu tự hại rõ → lưu vào messages.crisis_flagged


class CrisisThresholds:
    # Điểm cảm xúc 0–1 do Claude chấm độc lập (chưa hiệu chỉnh bằng dữ liệu thật).
    HEAVY_SADNESS      = 0.85
    HEAVY_FEAR         = 0.85
    HEAVY_COMBINED     = 1.60    # tổng 4 cảm xúc tiêu cực
    SAD_FEAR_COMBO     = (0.70, 0.60)
    CARE_CONSECUTIVE   = 4       # số lượt tiêu cực liên tiếp để bật "care"
    HIGH_HOLD_TURNS    = 3       # số lượt giữ CRITICAL sau một lượt explicit
    HIGH_HOLD_HOURS    = 6       # chỉ giữ nếu lượt explicit trong vòng chừng này giờ
    NEGATIVE_EMOTIONS  = ["anger", "disgust", "fear", "sadness"]


_ORDER     = [CrisisLevel.NONE, CrisisLevel.WATCH, CrisisLevel.ALERT, CrisisLevel.CRITICAL]
_RISK_MODE = {CrisisLevel.NONE: "none", CrisisLevel.WATCH: "care",
              CrisisLevel.ALERT: "watch", CrisisLevel.CRITICAL: "high"}
_ACTIONS   = {
    CrisisLevel.NONE:     "proceed_normal",
    CrisisLevel.WATCH:    "proceed_with_care",
    CrisisLevel.ALERT:    "generate_with_crisis_warning",
    # Vẫn gọi Claude với risk_mode="high". Chỉ dùng câu soạn sẵn khi Claude lỗi.
    CrisisLevel.CRITICAL: "generate_with_safety",
}


def safety_level(filter_result: FilterResult | None, self_harm: str) -> "CrisisLevel":
    """Mức an toàn chỉ từ tín hiệu tự hại: keyword filter (code) + self_harm (Claude).

    Không dùng điểm cảm xúc. Lấy mức cao hơn của hai nguồn, để chỉ thị giả trong
    tin nhắn không tắt được phần code.
    """
    fl = filter_result.risk_level if filter_result else RiskLevel.SAFE
    if self_harm == "explicit" or fl in (RiskLevel.CRITICAL, RiskLevel.HIGH):
        return CrisisLevel.CRITICAL
    if self_harm == "ambiguous" or (filter_result and filter_result.category == "self_harm_ambiguous"):
        return CrisisLevel.ALERT
    if fl == RiskLevel.MEDIUM:          # tuyệt vọng, vô dụng, không ai hiểu mình…
        return CrisisLevel.WATCH        # → "care": ấm hơn, không hỏi chuyện tự hại
    return CrisisLevel.NONE


def risk_mode_of(filter_result: FilterResult | None, self_harm: str) -> str:
    """none | care | watch | high — dùng khi chưa có ngữ cảnh nhiều lượt (lọc sớm, eval)."""
    return _RISK_MODE[safety_level(filter_result, self_harm)]


class CrisisChecker:

    def __init__(self, thresholds: CrisisThresholds = None):
        self.t = thresholds or CrisisThresholds()

    def check(
        self,
        session:        Session,
        user_id:        str,
        context_result: ContextResult,
        self_harm:      str = "none",   # từ TurnAnalysis.self_harm
        filter_result:  FilterResult | None = None,
    ) -> CrisisResult:
        reasons: list[str] = []

        # 1. Tín hiệu tự hại (quan trọng nhất): Claude + keyword filter
        level = safety_level(filter_result, self_harm)
        explicit_now = level == CrisisLevel.CRITICAL
        held = False
        if level != CrisisLevel.NONE:
            reasons.append(f"self_harm={self_harm}")
            if filter_result and filter_result.matched_keywords:
                reasons.append("từ khoá: " + ", ".join(filter_result.matched_keywords))

        # 1b. Vừa nói rõ ý tự hại trong vài lượt gần đây → giữ mức cao dù tin này nghe nhẹ hơn
        recent = self._recent_explicit_flags(session, user_id, self.t.HIGH_HOLD_TURNS, self.t.HIGH_HOLD_HOURS)
        if not explicit_now and any(recent):
            level, held = CrisisLevel.CRITICAL, True
            reasons.append("giữ mức cao sau một lượt nói rõ ý tự hại")

        # 2. Lượt ngay sau ALERT/CRITICAL: giữ ấm thêm một lượt
        if level == CrisisLevel.NONE and self._was_flagged(session, user_id):
            level = CrisisLevel.WATCH
            reasons.append("lượt trước có tín hiệu tự hại")

        # 3. Cảm xúc nặng / kéo dài → chỉ WATCH ("care"), không bao giờ cao hơn
        s = context_result.combined_scores
        sad, fear = s.get("sadness", 0.0), s.get("fear", 0.0)
        total_neg = sum(s.get(e, 0.0) for e in self.t.NEGATIVE_EMOTIONS)
        heavy = []
        if sad >= self.t.HEAVY_SADNESS:
            heavy.append(f"sadness {sad:.0%}")
        if fear >= self.t.HEAVY_FEAR:
            heavy.append(f"fear {fear:.0%}")
        if total_neg >= self.t.HEAVY_COMBINED:
            heavy.append(f"tổng tiêu cực {total_neg:.2f}")
        if sad >= self.t.SAD_FEAR_COMBO[0] and fear >= self.t.SAD_FEAR_COMBO[1]:
            heavy.append("buồn + lo cùng cao")
        if context_result.consecutive_negative_turns >= self.t.CARE_CONSECUTIVE:
            heavy.append(f"{context_result.consecutive_negative_turns} lượt tiêu cực liên tiếp")
        if heavy:
            reasons.extend(heavy)
            level = self._escalate(level, CrisisLevel.WATCH)

        is_crisis = level in (CrisisLevel.ALERT, CrisisLevel.CRITICAL)
        state = get_emotion_state(session, user_id)
        if state is not None:
            state.crisis_flag = is_crisis
            if explicit_now:
                state.last_crisis_at = datetime.utcnow()
            session.commit()

        return CrisisResult(
            level=level,
            is_crisis=is_crisis,
            reasons=reasons,
            action=_ACTIONS[level],
            # Chỉ báo khi người dùng vừa nói rõ, không báo lại ở các lượt giữ mức.
            # Hiện chưa có code nào dùng cờ này: không gửi gì ra ngoài.
            notify_system=explicit_now,
            risk_mode=_RISK_MODE[level],
            held=held,
            explicit_now=explicit_now,
        )

    @staticmethod
    def _escalate(current: CrisisLevel, new: CrisisLevel) -> CrisisLevel:
        return new if _ORDER.index(new) > _ORDER.index(current) else current

    @staticmethod
    def _recent_explicit_flags(session: Session, user_id: str, n: int, hours: float) -> list[bool]:
        """crisis_flagged của n tin gần nhất của user trong `hours` giờ qua (mới nhất trước),
        xuyên các cuộc trò chuyện: mở cuộc mới ngay sau đó vẫn được giữ mức."""
        since = datetime.utcnow() - timedelta(hours=hours)
        rows = (
            session.query(Message.crisis_flagged)
            .join(Conversation, Message.conversation_id == Conversation.conversation_id)
            .filter(Conversation.user_id == user_id, Message.timestamp >= since)
            .order_by(Message.timestamp.desc())
            .limit(n)
            .all()
        )
        return [bool(r[0]) for r in rows]

    @staticmethod
    def _was_flagged(session: Session, user_id: str) -> bool:
        state = get_emotion_state(session, user_id)
        if not state:
            return False
        return bool(state.crisis_flag)


_crisis_checker_instance = None


def get_crisis_checker() -> CrisisChecker:
    global _crisis_checker_instance
    if _crisis_checker_instance is None:
        _crisis_checker_instance = CrisisChecker()
    return _crisis_checker_instance


# ------------------------------------------------------------
# Test thử
# ------------------------------------------------------------
if __name__ == "__main__":
    from sqlalchemy.orm import sessionmaker

    from db.crud import create_conversation, create_user, save_message
    from db.models import init_db

    import os
    import tempfile
    # DB tạm mới mỗi lần chạy: chạy lại không bị trùng email, không để file rác trong repo
    engine  = init_db("sqlite:///" + os.path.join(tempfile.mkdtemp(), "test_crisis.db"))
    session = sessionmaker(bind=engine)()
    user    = create_user(session, name="Test User", email="crisis@test.local")
    checker = get_crisis_checker()
    conv    = create_conversation(session, user.user_id)

    calm = {"anger": 0.05, "disgust": 0.02, "fear": 0.10, "joy": 0.60,
            "sadness": 0.10, "surprise": 0.08, "trust": 0.03, "anticipation": 0.02}
    sad  = {"anger": 0.10, "disgust": 0.05, "fear": 0.20, "joy": 0.02,
            "sadness": 0.80, "surprise": 0.02, "trust": 0.05, "anticipation": 0.02}

    cases = [
        ("😊 Bình thường",                         calm, 0, "none",      CrisisLevel.NONE),
        ("😔 Buồn 7 lượt liền (không tự hại)",      sad,  7, "none",      CrisisLevel.WATCH),
        ("❔ 'muốn biến mất'",                      sad,  2, "ambiguous", CrisisLevel.ALERT),
        ("🚨 'có lúc mình nghĩ đến chuyện tự tử'",  sad,  3, "explicit",  CrisisLevel.CRITICAL),
        ("🔒 'ở nhà một mình, chưa làm gì đâu'",    sad,  4, "ambiguous", CrisisLevel.CRITICAL),
        ("🔒 'để mình gọi cho chị gái'",            calm, 0, "none",      CrisisLevel.CRITICAL),
        ("🔒 'chị nghe máy rồi'",                   calm, 0, "none",      CrisisLevel.CRITICAL),
        ("↩️  Hết giữ mức → care một lượt",          calm, 0, "none",      CrisisLevel.WATCH),
        ("✅ Lượt tiếp theo nữa",                    calm, 0, "none",      CrisisLevel.NONE),
    ]

    print("\n" + "=" * 60)
    failed = 0
    for name, scores, consec, harm, expected in cases:
        dominant = max(scores, key=scores.get)
        ctx = ContextResult(
            has_history=True, combined_scores=scores, dominant_emotion=dominant,
            is_negative=dominant in CrisisThresholds.NEGATIVE_EMOTIONS,
            consecutive_negative_turns=consec, recent_messages=[], summary="",
        )
        r  = checker.check(session, user.user_id, ctx, self_harm=harm)
        save_message(session, conv.conversation_id, user_input=name, bot_response="ok",
                     crisis_flagged=r.explicit_now)
        ok = r.level == expected
        failed += not ok
        print(f"{'✅' if ok else '❌'} {name}: {r.level.value} (mong đợi {expected.value}) "
              f"risk_mode={r.risk_mode} held={r.held} | {', '.join(r.reasons) or '-'}")

    session.close()
    print("=" * 60 + f"\n{'Tất cả đúng' if not failed else f'{failed} ca sai'}")
