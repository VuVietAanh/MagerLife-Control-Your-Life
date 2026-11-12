# ============================================================
# pipeline.py — Luồng xử lý một tin nhắn
#
#   keyword filter (code) ─┐
#   TurnAnalyzer (Haiku, thấy cả tin cuối của bot): cảm xúc + ý định + self_harm
#   EMA cảm xúc → CrisisChecker → risk_mode:
#       high  = tự hại rõ         watch = mơ hồ / trả lời nửa vời
#       care  = buồn kéo dài      none
#   (RAG nếu MINDSPACE_RAG=1) → Generator (Sonnet) → lưu DB
#
# Nguy cơ được tính TRƯỚC khi xét ý định, nên "để sau"/"thôi" không
# còn bỏ qua kiểm tra an toàn như bản cũ.
# ============================================================

import os
import re
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from core.context import get_context_manager, get_last_bot_message
from core.crisis import get_crisis_checker, risk_mode_of
from core.emotion import PLUTCHIK_EMOTIONS, get_turn_analyzer
from core.generator import get_generator
from core.intent import RESPONSE_STRATEGY, Intent
from core.keyword_filter import keyword_filter
from db.crud import (create_conversation, create_user, end_conversation,
                     get_emotion_state, get_recent_conversations,
                     get_recent_messages, get_user, save_message,
                     update_last_active)
from db.models import init_db

load_dotenv()


@dataclass
class PipelineResult:
    response:         str
    greeting:         str | None
    crisis_level:     str
    dominant_emotion: str
    was_flagged:      bool
    action_taken:     str
    emotion_method:   str
    intent:           str = "neutral"
    high_emotion:     str | None = None
    emotion_scores:   dict = field(default_factory=lambda: {e: 0.0 for e in PLUTCHIK_EMOTIONS})


_VN_TZ   = timezone(timedelta(hours=7))   # Việt Nam không có giờ mùa hè
_WEEKDAY = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]
_CRISIS_LEVEL_OUT = {"high": "critical", "watch": "alert", "care": "watch", "none": "none"}


def when_phrase(at_utc: datetime, elapsed: timedelta) -> str:
    """Mốc thời gian nói theo ngày giờ Việt Nam, vd 'hôm qua (khoảng 22 giờ trước)'."""
    days = ((datetime.now(timezone.utc) + timedelta(hours=7)).date()
            - (at_utc.replace(tzinfo=timezone.utc) + timedelta(hours=7)).date()).days
    word = {0: "hôm nay", 1: "hôm qua", 2: "hôm kia"}.get(days, f"{days} hôm trước")
    return f"{word} (khoảng {max(1, round(elapsed.total_seconds() / 3600))} giờ trước)"


def local_time_vn(now: datetime | None = None) -> str:
    """Vd "Thứ Hai 00:52" — để bot không chỉ tới đường dây hỗ trợ đang ngoài giờ."""
    now = now or datetime.now(_VN_TZ)
    return f"{_WEEKDAY[now.weekday()]} {now:%H:%M}"


class ChatbotPipeline:

    def __init__(self, db_url: str = None):
        db_url = db_url or os.getenv("DATABASE_URL", "sqlite:///chatbot.db")
        self._engine = init_db(db_url)

        from sqlalchemy.orm import sessionmaker
        self._Session = sessionmaker(bind=self._engine)

        print("\n⏳ Loading pipeline components...")
        self._analyzer        = get_turn_analyzer()
        self._context_manager = get_context_manager(alpha=float(os.getenv("EMA_ALPHA", 0.3)))
        # RAG tắt mặc định: kỹ thuật trò chuyện đã được chắt lọc vào prompt (core/generator.py).
        # Bật lại bằng MINDSPACE_RAG=1 (cần AI_SERVICE_URL, faiss-cpu, numpy).
        self._retriever       = self._load_retriever() if os.getenv("MINDSPACE_RAG") == "1" else None
        self._generator       = get_generator()
        self._crisis_checker  = get_crisis_checker()
        print("✅ Pipeline ready!\n")

    def _load_retriever(self):
        from core.embedding import get_embedder
        from core.retrieval import DocumentChunker, get_retriever
        retriever   = get_retriever(embedder=get_embedder())
        index_path  = "data/faiss.index"
        chunks_path = "data/chunks.json"
        kb_path     = "data/knowledge_base"

        if os.path.exists(index_path) and os.path.exists(chunks_path):
            retriever.load(index_path, chunks_path)
        elif os.path.exists(kb_path) and os.path.isdir(kb_path) and os.listdir(kb_path):
            print("⏳ Building FAISS index...")
            chunker = DocumentChunker(
                chunk_size=int(os.getenv("CHUNK_SIZE", 256)),
                chunk_overlap=int(os.getenv("CHUNK_OVERLAP", 30)),
                window_size=int(os.getenv("WINDOW_SIZE", 1)),
            )
            chunks = chunker.chunk_directory(kb_path)
            retriever.build(chunks)
            retriever.save(index_path, chunks_path)
        else:
            print("⚠️  No knowledge base. RAG skipped.")
        return retriever

    def get_greeting_if_returning(self, session: Session, user_id: str, name: str = None) -> str | None:
        emotion_state = get_emotion_state(session, user_id)
        if not emotion_state or emotion_state.turn_count == 0:
            return None
        last_topic = self._get_last_topic(session, user_id)
        result = self._generator.generate_greeting(
            name=name,
            dominant_emotion=emotion_state.dominant_emotion,
            last_topic=last_topic,
            consecutive_neg=emotion_state.consecutive_negative_turns,
        )
        return result.response if result else None

    def _get_last_topic(self, session: Session, user_id: str) -> str | None:
        convs = get_recent_conversations(session, user_id, limit=2)
        for conv in convs:
            messages = get_recent_messages(session, conv.conversation_id, limit=1)
            if messages:
                return messages[0].user_input[:100]
        return None

    RECENT_CRISIS_HOURS = 72

    def _recent_crisis_elsewhere(self, session: Session, user_id: str, conversation_id: str) -> str | None:
        """Người dùng nói rõ ý tự hại trong 72 giờ qua ở một cuộc trò chuyện KHÁC.

        Chỉ bật ở 2 lượt đầu của cuộc mới. Quá 72 giờ thì xoá last_crisis_at (dữ liệu nhạy cảm,
        không giữ lâu hơn mức cần). Xoá kiểu "lười": chỉ chạy khi người dùng nhắn."""
        from db.models import Message
        state = get_emotion_state(session, user_id)
        if not state or not state.last_crisis_at:
            return None
        elapsed = datetime.utcnow() - state.last_crisis_at
        if elapsed > timedelta(hours=self.RECENT_CRISIS_HOURS):
            state.last_crisis_at = None
            session.commit()
            return None
        msgs = session.query(Message.crisis_flagged).filter(Message.conversation_id == conversation_id).all()
        if len(msgs) >= 2 or any(f for (f,) in msgs):
            return None
        return when_phrase(state.last_crisis_at, elapsed)

    _NO_Q_RE = re.compile(r"(đừng|khỏi|thôi|không cần|ko cần|k cần)\s+hỏi|hỏi\s+(ít|ít thôi)\b|hỏi\s+(gì\s+)?nhiều\s+(quá|thế)|hỏi qua hỏi lại|hỏi (hoài|mãi|suốt)"
                          r"|stop asking|don'?t ask", re.IGNORECASE)

    def _no_questions_requested(self, session: Session, conversation_id: str, user_input: str) -> bool:
        """Người dùng đã bảo đừng hỏi nữa ở tin này hoặc tin trước trong cùng cuộc trò chuyện."""
        from db.models import Message
        if self._NO_Q_RE.search(user_input or ""):
            return True
        rows = session.query(Message.user_input).filter(Message.conversation_id == conversation_id).all()
        return any(self._NO_Q_RE.search(t or "") for (t,) in rows)

    @staticmethod
    def _listen_only_active(session: Session, conversation_id: str, intent: Intent) -> bool:
        """Lần gần nhất người dùng nói rõ 'chỉ muốn nghe' mà chưa tự hỏi ý kiến sau đó."""
        from db.models import Message
        if intent in (Intent.GUIDANCE, Intent.QUESTION):
            return False
        last = (session.query(Message.intent)
                .filter(Message.conversation_id == conversation_id,
                        Message.intent.in_([Intent.LISTEN.value, Intent.GUIDANCE.value, Intent.QUESTION.value]))
                .order_by(Message.timestamp.desc()).first())
        return bool(last) and last[0] == Intent.LISTEN.value

    def _get_recent_history(self, session: Session, conversation_id: str, limit: int = 2) -> list[dict]:
        """Vài lượt gần nhất, cả hai phía, cho analyzer."""
        out = []
        for msg in reversed(get_recent_messages(session, conversation_id, limit=limit)):
            if msg.user_input:
                out.append({"role": "user", "content": msg.user_input})
            if msg.bot_response:
                out.append({"role": "assistant", "content": msg.bot_response})
        return out

    def process(
        self,
        user_input: str,
        user_id: str,
        conversation_id: str,
        greeting: str = None,
    ) -> PipelineResult:
        session = self._Session()
        try:
            update_last_active(session, user_id)

            # ══ Tín hiệu nguy cơ: code + Claude ═══════════════
            filter_result  = keyword_filter.check(user_input)
            recent_history = self._get_recent_history(session, conversation_id)
            analysis       = self._analyzer.analyze(
                user_input, recent_history or None,
                last_bot_message=get_last_bot_message(session, conversation_id),
            )
            emotion_result = analysis.emotion
            intent         = Intent.parse(analysis.intent)
            strategy       = RESPONSE_STRATEGY.get(intent, RESPONSE_STRATEGY[Intent.NEUTRAL])
            early_risk     = risk_mode_of(filter_result, analysis.self_harm)

            # ══ "Để sau" / "thôi": trả lời ngắn — chỉ khi không có nguy cơ ══
            if intent in (Intent.DEFER, Intent.REJECT) and early_risk in ("none", "care"):
                gen_result = self._generator.generate(
                    user_input=user_input,
                    intent_instruction=strategy["instruction"],
                )
                save_message(session, conversation_id, user_input=user_input,
                             bot_response=gen_result.response, intent=intent.value,
                             keyword_flagged=filter_result.is_flagged)
                return PipelineResult(
                    response=gen_result.response, greeting=greeting,
                    crisis_level="none", dominant_emotion=emotion_result.dominant_emotion,
                    was_flagged=filter_result.is_flagged, action_taken=f"intent_{intent.value}",
                    emotion_method=emotion_result.method, intent=intent.value,
                    emotion_scores=emotion_result.scores,
                )

            # ══ Context + EMA + đổi cảm xúc + cảm xúc cao ══════
            old_state        = get_emotion_state(session, user_id)
            reverse_question = self._context_manager.get_reverse_question(
                old_state=old_state, current_emotion=emotion_result,
            )
            context_result = self._context_manager.process(
                session=session, user_id=user_id,
                conversation_id=conversation_id,
                current_emotion=emotion_result,
            )
            if intent == Intent.VENTING:
                reverse_question = None

            # Cảm xúc cao: chỉ là GỢI Ý Ý, generator tự diễn đạt (không gửi câu soạn sẵn)
            high_alert        = context_result.high_emotion_alert
            high_emotion_name = None
            if high_alert.detected and high_alert.check_in_prompt:
                high_emotion_name = high_alert.emotion
                reverse_question  = "; ".join(x for x in (reverse_question, high_alert.check_in_prompt) if x)

            # Trước crisis check: lượt này có thể cập nhật last_crisis_at
            recent_crisis = self._recent_crisis_elsewhere(session, user_id, conversation_id)
            listen_only   = intent == Intent.LISTEN or self._listen_only_active(session, conversation_id, intent)
            no_questions  = self._no_questions_requested(session, conversation_id, user_input)

            # ══ Crisis check theo nhiều lượt ══════════════════
            crisis_result = self._crisis_checker.check(
                session=session, user_id=user_id, context_result=context_result,
                self_harm=analysis.self_harm, filter_result=filter_result,
            )
            risk_mode = crisis_result.risk_mode

            # ══ RAG ══════════════════════════════════════════
            # Chỉ chạy khi MINDSPACE_RAG=1. Embedding hiện là model tiếng Anh.
            rag_context = ""
            if self._retriever is not None and self._retriever._is_built:
                top_emotions    = sorted(context_result.combined_scores.items(), key=lambda x: -x[1])[:2]
                emotion_summary = ", ".join(f"{e} ({s:.0%})" for e, s in top_emotions if s > 0.05)
                enriched_query  = f"{emotion_summary}. {user_input}" if emotion_summary else user_input
                retrieval = self._retriever.retrieve(
                    query=enriched_query,
                    top_k=int(os.getenv("RETRIEVAL_TOP_K", 3)),
                    emotion_summary=emotion_summary,
                    score_threshold=float(os.getenv("RETRIEVAL_SCORE_THRESHOLD", 0.25)),
                )
                rag_context = retrieval.context

            # ══ Generate ═════════════════════════════════════
            emotion_shift = context_result.emotion_shift
            gen_result = self._generator.generate(
                user_input=user_input,
                rag_context=rag_context,
                emotion_summary=context_result.summary,
                recent_messages=context_result.recent_messages,
                has_history=context_result.has_history,
                consecutive_neg=context_result.consecutive_negative_turns,
                reverse_question=reverse_question,
                crisis_warning=False,   # đã gộp vào risk_mode
                risk_mode=risk_mode,
                risk_held=crisis_result.held,
                emotion_shift_hint=emotion_shift.response_hint if emotion_shift.detected else None,
                intent_instruction=strategy["instruction"],
                recent_bot_responses=context_result.recent_bot_responses,
                turn_count=len(context_result.recent_bot_responses),   # số lượt trong cuộc này (tối đa 6)
                local_time=local_time_vn(),
                listen_only=listen_only,
                recent_crisis=recent_crisis,
                no_questions=no_questions,
            )

            save_message(
                session, conversation_id,
                user_input=user_input,
                bot_response=gen_result.response,
                intent=intent.value,   # nguồn cho chế độ chỉ nghe ở lượt sau
                keyword_flagged=filter_result.is_flagged,
                crisis_flagged=crisis_result.explicit_now,   # nguồn cho việc giữ mức cao ở lượt sau
            )

            crisis_level = _CRISIS_LEVEL_OUT[risk_mode]

            return PipelineResult(
                response=gen_result.response,
                greeting=greeting,
                crisis_level=crisis_level,
                dominant_emotion=emotion_result.dominant_emotion,
                was_flagged=filter_result.is_flagged,
                action_taken="static_fallback" if gen_result.model == "fallback" else f"risk_{risk_mode}",
                emotion_method=emotion_result.method,
                intent=intent.value,
                high_emotion=high_emotion_name,
                emotion_scores=emotion_result.scores,
            )

        finally:
            session.close()

    def end_session(self, conversation_id: str):
        session = self._Session()
        try:
            end_conversation(session, conversation_id)
        finally:
            session.close()
