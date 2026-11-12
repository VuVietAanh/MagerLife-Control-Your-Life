# ============================================================
# core/intent.py — Ý định của người dùng và chiến lược trả lời
#
# Ý định do TurnAnalyzer (core/emotion.py) xác định bằng Claude.
# File này giữ enum và chỉ dẫn cho từng ý định.
#
# Thay đổi so với bản cũ:
# - Thêm GUIDANCE: người dùng bế tắc / hỏi "nên làm gì" → được phép
#   nói góc nhìn thật lòng và gợi việc nhỏ cụ thể.
# - Thêm CLOSING: chào tạm biệt / đi ngủ → đáp lại cho trọn, không hỏi.
# - VENTING không còn bắt buộc kết bằng câu hỏi.
# ============================================================

from enum import Enum


class Intent(str, Enum):
    DEFER    = "defer"      # Để sau, chưa muốn nói
    REJECT   = "reject"     # Từ chối, muốn dừng
    VENTING  = "venting"    # Xả cảm xúc, cần được nghe
    LISTEN   = "listen_only" # Nói rõ chỉ muốn được nghe → giữ chế độ chỉ nghe cả cuộc
    FEEDBACK = "feedback"   # Chê cách chatbot nói (như robot, sáo) — KHÔNG phải muốn dừng
    CONTINUE = "continue"   # Muốn kể tiếp
    GUIDANCE = "guidance"   # Bế tắc, hỏi nên làm gì, cần góc nhìn
    QUESTION = "question"   # Hỏi chatbot một điều cụ thể
    GREETING = "greeting"   # Chào hỏi
    CLOSING  = "closing"    # Tạm biệt, đi ngủ, kết thúc
    NEUTRAL  = "neutral"    # Không rõ

    @classmethod
    def parse(cls, value: str) -> "Intent":
        try:
            return cls(value)
        except ValueError:
            return cls.NEUTRAL


RESPONSE_STRATEGY = {
    Intent.DEFER: {
        "instruction": (
            "Người dùng chưa muốn nói lúc này. Tôn trọng. 1–2 câu ấm áp, "
            "cho họ biết lúc nào muốn thì cứ quay lại. Không hỏi thêm."
        ),
    },
    Intent.REJECT: {
        "instruction": (
            "Người dùng muốn dừng. Lùi lại ngay, một câu ngắn, nhẹ nhàng, không dỗi. "
            "Không hỏi, không giải thích."
        ),
    },
    Intent.VENTING: {
        "instruction": (
            "Người dùng đang xả cảm xúc. Ưu tiên nghe: phản chiếu đúng điều họ kể và cảm xúc bên dưới. Chưa khuyên. "
            "Có khi chỉ cần nghe và đáp lại, không hỏi; chỉ hỏi khi thật sự giúp họ kể tiếp. "
            "Nếu họ nói rõ chỉ muốn nói ra, chỉ nghe và để ngỏ."
        ),
    },
    Intent.LISTEN: {
        "instruction": (
            "Người dùng vừa nói rõ họ chỉ muốn được nghe. Đáp ngắn, ấm, cho họ biết bạn đang nghe và họ cứ kể. "
            "Không khuyên, không gợi ý việc làm, không hỏi dồn."
        ),
    },
    Intent.FEEDBACK: {
        "instruction": (
            "Người dùng đang chê cách bạn nói (nghe như robot, sáo, hỏi nhiều). Họ KHÔNG muốn dừng. "
            "Nhận ngắn một câu, không thanh minh, không xin lỗi dài, không xin dừng. Đổi giọng ngay trong chính tin này: "
            "ngắn hơn, đời thường hơn, rồi quay lại chuyện của họ."
        ),
    },
    Intent.CONTINUE: {
        "instruction": (
            "Người dùng đang kể tiếp. Bám vào chi tiết mới họ vừa thêm. "
            "Nếu đã hiểu khá rõ câu chuyện, có thể nói thật một góc nhìn ngắn và dừng ở đó; "
            "nếu chưa, hỏi một câu cụ thể để hiểu sâu hơn. Nếu họ vừa nói sẽ làm một việc, "
            "chỉ cần ghi nhận ngắn, không nhắc lại lời khuyên cũ."
        ),
    },
    Intent.GUIDANCE: {
        "instruction": (
            "Người dùng đang bế tắc hoặc hỏi nên làm gì. Đây là lúc nói thật lòng như một người bạn. "
            "Ngắn gọn công nhận điều họ đang giằng co, rồi nói góc nhìn của bạn: "
            "nếu họ đang tự hạ thấp mình hay kết luận quá tay thì nhẹ nhàng không đồng ý và nói vì sao; "
            "nếu thấy một vòng lặp họ chưa thấy thì chỉ ra. "
            "Gợi 1–2 việc nhỏ, cụ thể, làm được sớm, KHÁC những việc bạn đã gợi ở các lượt trước. "
            "Quyết định là của họ. Khoảng 120 chữ, không viết thành danh sách dài. "
            "Nói xong góc nhìn thì thường dừng ở đó, không cần hỏi thêm."
        ),
    },
    Intent.QUESTION: {
        "instruction": (
            "Người dùng đang hỏi bạn. Trả lời thật lòng, cụ thể, gần gũi, không giảng giải. "
            "Nếu thấy tự nhiên, sau đó hỏi một câu liên quan tới chính họ."
        ),
    },
    Intent.GREETING: {
        "instruction": (
            "Người dùng chào. Đáp lại ấm áp, ngắn, và mời họ kể điều đang nghĩ. 1–2 câu."
        ),
    },
    Intent.CLOSING: {
        "instruction": (
            "Người dùng đang chào tạm biệt hoặc đi nghỉ. Đáp lại ngắn, ấm, cho trọn. "
            "Không hỏi thêm (kể cả câu hỏi nhẹ), không tóm tắt, không khuyên thêm."
        ),
    },
    Intent.NEUTRAL: {
        "instruction": (
            "Chưa rõ người dùng cần gì. Phản chiếu ngắn điều bạn nghe được và hỏi một câu mở nhẹ."
        ),
    },
}


def get_instruction(intent: str | Intent) -> str:
    return RESPONSE_STRATEGY[Intent.parse(intent) if isinstance(intent, str) else intent]["instruction"]
