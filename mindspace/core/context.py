# ============================================================
# core/context.py
# EMA cảm xúc theo thời gian + phát hiện chuyển cảm xúc + cảm xúc cao
#
# Thay đổi so với bản cũ:
# - Sửa alpha bị ngược: trước đây khi CÓ chuyển cảm xúc, alpha lại nhỏ
#   hơn lúc bình thường (0.15 < 0.3) → phản ứng chậm hơn đúng lúc cần nhanh.
# - Chỉ còn MỘT nguồn EMA (lấy từ DB sau update_emotion_state), không
#   tính lại ở local cho khỏi lệch.
# - Bỏ các câu check-in soạn sẵn theo giọng cũ; giờ chỉ là GỢI Ý Ý cho
#   generator tự diễn đạt.
# - Xét đủ 8 cảm xúc (Claude chấm cả trust/anticipation).
# - Một lần query DB cho cả recent_messages và recent_bot_responses.
# - recent_bot_responses có default → các chỗ tạo ContextResult cũ không crash.
# - Thêm turn_count và hàm get_last_bot_message() cho analyzer.
# ============================================================

import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from core.emotion import EmotionResult
from db.crud import get_emotion_state, get_recent_messages, update_emotion_state
from db.models import EmotionState

PLUTCHIK_EMOTIONS = ["anger", "disgust", "fear", "joy", "sadness", "surprise", "trust", "anticipation"]
NEGATIVE_EMOTIONS = ["anger", "disgust", "fear", "sadness"]
POSITIVE_EMOTIONS = ["joy", "trust", "anticipation", "surprise"]

SHIFT_THRESHOLD     = 0.30
HIGH_EMOTION_THRESH = 0.75

INTENSIFIERS = ["very", "extremely", "so", "really", "incredibly", "totally", "completely", "super",
                "rất", "quá", "cực kỳ", "cực kì", "lắm", "vô cùng", "kinh khủng", "siêu", "thật sự"]
SOFTENERS    = ["a bit", "a little", "slightly", "kind of", "kinda", "sort of",
                "hơi", "một chút", "một tí", "chút chút", "hơi hơi", "cũng tạm"]
NEUTRAL_WORDS = ["good", "okay", "ok", "fine", "alright", "better",
                 "ổn", "bình thường", "đỡ hơn", "tạm ổn", "khá hơn"]

# Alpha = trọng số của tin MỚI trong EMA. Lớn hơn → bám tin mới nhanh hơn.
ALPHA_BASE       = 0.30   # không có chuyển cảm xúc
ALPHA_SHIFT_SOFT = 0.25   # có chuyển, nhưng nói giảm nhẹ ("hơi")
ALPHA_SHIFT      = 0.45   # có chuyển, bình thường
ALPHA_SHIFT_MOD  = 0.40   # có chuyển, kèm từ trung tính ("ổn", "đỡ hơn")
ALPHA_SHIFT_HIGH = 0.60   # có chuyển, kèm từ nhấn mạnh ("rất", "quá")


@dataclass
class EmotionShift:
    detected:      bool
    direction:     str | None
    prev_emotion:  str | None
    curr_emotion:  str | None
    prev_score:    float
    curr_score:    float
    response_hint: str | None


@dataclass
class HighEmotionAlert:
    detected:        bool
    emotion:         str | None
    score:           float
    is_negative:     bool
    check_in_prompt: str | None   # GỢI Ý Ý cho generator, không phải câu để gửi nguyên văn


def _no_shift(prev=None, curr=None, ps=0.0, cs=0.0) -> EmotionShift:
    return EmotionShift(False, None, prev, curr, ps, cs, None)


def _no_alert() -> HighEmotionAlert:
    return HighEmotionAlert(False, None, 0.0, False, None)


@dataclass
class ContextResult:
    has_history:                bool
    combined_scores:            dict[str, float]
    dominant_emotion:           str
    is_negative:                bool
    consecutive_negative_turns: int
    recent_messages:            list[dict]
    summary:                    str
    recent_bot_responses:       list[str] = field(default_factory=list)
    turn_count:                 int = 0
    dynamic_alpha:              float = ALPHA_BASE
    emotion_shift:              EmotionShift = field(default_factory=_no_shift)
    high_emotion_alert:         HighEmotionAlert = field(default_factory=_no_alert)


# Gợi ý ý (generator tự diễn đạt). Không có câu cho joy: không cần "check-in" khi người ta vui.
HIGH_EMOTION_HINTS = {
    "sadness": "nỗi buồn đang khá nặng; có thể hỏi nhẹ họ muốn kể tiếp hay cần nghỉ một chút",
    "fear":    "lo âu đang cao; có thể gợi một việc nhỏ giúp dịu lại ngay (thở chậm, uống nước)",
    "anger":   "họ đang rất bực; để họ nói cho ra trước, chưa phân tích",
    "disgust": "họ đang rất khó chịu; để họ nói cho ra trước",
}

REVERSE_HINTS = {
    "sadness": "lúc trước họ khá buồn, giờ nhẹ hơn; có thể hỏi điều gì đã đổi khác",
    "anger":   "lúc trước họ rất bực, giờ dịu hơn; có thể hỏi chuyện đó giờ thế nào",
    "fear":    "lúc trước họ lo lắng, giờ dịu hơn; có thể hỏi điều gì giúp họ đỡ",
    "disgust": "lúc trước họ rất khó chịu, giờ dịu hơn",
}


class ContextManager:

    def __init__(self, alpha: float = ALPHA_BASE, recent_msg_limit: int = 10):
        self.base_alpha       = alpha
        self.recent_msg_limit = recent_msg_limit   # số LƯỢT (mỗi lượt = 1 tin user + 1 tin bot)

    def process(
        self,
        session: Session,
        user_id: str,
        conversation_id: str,
        current_emotion: EmotionResult,
    ) -> ContextResult:

        old_state   = get_emotion_state(session, user_id)
        recent_msgs, recent_bot = self._get_recent(session, conversation_id)
        has_history = bool(old_state and old_state.turn_count > 0)

        emotion_shift = self._detect_shift(old_state, current_emotion)
        dynamic_alpha = self._compute_alpha(current_emotion.raw_text, emotion_shift)

        updated_state = update_emotion_state(
            session=session,
            user_id=user_id,
            new_scores=current_emotion.scores,
            alpha=dynamic_alpha,
        )

        # Một nguồn EMA duy nhất: trạng thái DB vừa cập nhật.
        if updated_state is not None:
            combined_scores = self._state_to_dict(updated_state)
        else:
            combined_scores = current_emotion.scores.copy()

        top         = max(combined_scores, key=combined_scores.get)
        dominant    = top if combined_scores[top] >= 0.2 else "neutral"
        is_negative = dominant in NEGATIVE_EMOTIONS
        consecutive = updated_state.consecutive_negative_turns if updated_state else 0
        turn_count  = updated_state.turn_count if updated_state else 0

        return ContextResult(
            has_history=has_history,
            combined_scores=combined_scores,
            dominant_emotion=dominant,
            is_negative=is_negative,
            consecutive_negative_turns=consecutive,
            recent_messages=recent_msgs,
            recent_bot_responses=recent_bot,
            summary=self._build_summary(has_history, dominant, consecutive, combined_scores),
            turn_count=turn_count,
            dynamic_alpha=dynamic_alpha,
            emotion_shift=emotion_shift,
            high_emotion_alert=self._check_high_emotion(combined_scores, updated_state),
        )

    # ----------------------------------------------------------
    def _check_high_emotion(self, scores: dict[str, float], state: EmotionState) -> HighEmotionAlert:
        """Cảm xúc tiêu cực nào >= 75% (sau ít nhất 3 lượt) → gợi ý ý cho generator."""
        if not state or state.turn_count < 3:
            return _no_alert()
        high = [(e, scores.get(e, 0.0)) for e in NEGATIVE_EMOTIONS if scores.get(e, 0.0) >= HIGH_EMOTION_THRESH]
        if not high:
            return _no_alert()
        top, score = max(high, key=lambda x: x[1])
        return HighEmotionAlert(True, top, score, True, HIGH_EMOTION_HINTS.get(top))

    # ----------------------------------------------------------
    def _compute_alpha(self, text: str, shift: EmotionShift) -> float:
        if not text or not shift.detected:
            return self.base_alpha

        low      = text.lower()
        has_word = lambda w: re.search(r"(?<!\w)" + re.escape(w) + r"(?!\w)", low) is not None

        if any(has_word(w) for w in SOFTENERS):     return ALPHA_SHIFT_SOFT
        if any(has_word(w) for w in INTENSIFIERS):  return ALPHA_SHIFT_HIGH
        if any(has_word(w) for w in NEUTRAL_WORDS): return ALPHA_SHIFT_MOD
        return ALPHA_SHIFT

    # ----------------------------------------------------------
    def _detect_shift(self, old_state: EmotionState, current: EmotionResult) -> EmotionShift:
        if not old_state or old_state.turn_count == 0:
            return _no_shift()

        prev, curr = old_state.dominant_emotion, current.dominant_emotion
        if not prev or not curr or prev == curr or "neutral" in (prev, curr):
            return _no_shift(prev, curr)

        ps = getattr(old_state, prev, 0.0) or 0.0
        cs = current.scores.get(curr, 0.0)
        if ps < SHIFT_THRESHOLD or cs < SHIFT_THRESHOLD:
            return _no_shift(prev, curr, ps, cs)

        prev_neg, curr_neg = prev in NEGATIVE_EMOTIONS, curr in NEGATIVE_EMOTIONS
        if prev_neg == curr_neg:
            return _no_shift(prev, curr, ps, cs)

        if prev_neg:
            hint = (f"Trước đó {prev} cao, giờ chuyển sang {curr}. Ghi nhận nhẹ nhàng, "
                    f"đừng vội cho là họ đã ổn hẳn. Có thể hỏi điều gì đã đổi khác.")
            return EmotionShift(True, "negative_to_positive", prev, curr, ps, cs, hint)
        hint = (f"Họ chuyển từ {prev} sang {curr}. Tò mò nhẹ nhàng về chuyện vừa xảy ra, "
                f"chưa khuyên vội.")
        return EmotionShift(True, "positive_to_negative", prev, curr, ps, cs, hint)

    # ----------------------------------------------------------
    def get_reverse_question(self, old_state: EmotionState,
                             current_emotion: EmotionResult, threshold: float = 0.3) -> str | None:
        """Trả về GỢI Ý Ý khi một cảm xúc tiêu cực vừa dịu đi rõ rệt."""
        if not old_state:
            return None
        for emotion in NEGATIVE_EMOTIONS:
            if (getattr(old_state, emotion, 0.0) or 0.0) >= threshold and current_emotion.scores.get(emotion, 0.0) < 0.2:
                return REVERSE_HINTS.get(emotion)
        return None

    # ----------------------------------------------------------
    def _state_to_dict(self, state: EmotionState) -> dict[str, float]:
        return {e: float(getattr(state, e, 0.0) or 0.0) for e in PLUTCHIK_EMOTIONS}

    def _get_recent(self, session: Session, conversation_id: str) -> tuple[list[dict], list[str]]:
        rows = list(reversed(get_recent_messages(session, conversation_id, limit=self.recent_msg_limit)))
        msgs, bot = [], []
        for r in rows:
            if r.user_input:
                msgs.append({"role": "user", "content": r.user_input})
            if r.bot_response:
                msgs.append({"role": "assistant", "content": r.bot_response})
                bot.append(r.bot_response)
        return msgs, bot[-6:]

    def _build_summary(self, has_history, dominant, consecutive, scores) -> str:
        top     = sorted(scores.items(), key=lambda x: -x[1])[:3]
        top_str = ", ".join(f"{e} ({s:.0%})" for e, s in top if s > 0.05)
        warn    = f" {consecutive} lượt tiêu cực liên tiếp." if consecutive >= 3 else ""
        prefix  = "Người dùng quay lại" if has_history else "Lần đầu trò chuyện"
        return f"{prefix}. Nổi bật: {dominant}. Cao nhất: {top_str or 'không rõ'}.{warn}"


def get_last_bot_message(session: Session, conversation_id: str) -> str | None:
    """Tin cuối bot đã gửi trong cuộc trò chuyện — truyền vào TurnAnalyzer.analyze()."""
    rows = get_recent_messages(session, conversation_id, limit=1)
    return rows[0].bot_response if rows and rows[0].bot_response else None


_context_manager_instance = None


def get_context_manager(alpha: float = ALPHA_BASE) -> ContextManager:
    global _context_manager_instance
    if _context_manager_instance is None:
        _context_manager_instance = ContextManager(alpha=alpha)
    return _context_manager_instance
