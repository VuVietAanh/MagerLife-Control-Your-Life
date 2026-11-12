# ============================================================
# core/keyword_filter.py — Lọc từ khoá nguy cơ (tiếng Việt + tiếng Anh)
#
# Đây là lớp kiểm tra bằng CODE, chạy trước LLM, nên lời nhắn kiểu
# "bỏ qua mọi quy tắc" không tắt được nó. Kết quả chỉ dùng để đổi
# giọng trả lời (risk_mode trong pipeline), không chặn hay hiện số khẩn cấp.
#
# Sửa so với bản cũ:
# - Giữ dấu nháy (') khi so khớp: "i don't want to live" khớp lại được.
# - Phủ định so theo TỪ NGUYÊN VẸN, trong cùng mệnh đề, sát trước từ khoá:
#   "know" không còn bị coi là "no"; "without" không còn là phủ định.
# - So khớp cả bản không dấu: "toi muon chet" khớp "tôi muốn chết".
# - "muốn chết" kiểu cường điệu ("đói muốn chết", "mệt muốn chết") bị bỏ qua.
# ============================================================

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum


class RiskLevel(str, Enum):
    SAFE     = "safe"
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"


LEVEL_ORDER = [RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]


@dataclass
class FilterResult:
    is_flagged:       bool
    risk_level:       RiskLevel
    matched_keywords: list[str]
    category:         str | None


# Phủ định: chỉ xét tối đa NEGATION_WINDOW từ ngay trước từ khoá, trong cùng mệnh đề.
NEGATION_WINDOW = 3
NEGATIONS = [
    # tiếng Việt
    "không", "chẳng", "chả", "chưa", "đừng", "không hề", "chẳng hề", "chưa bao giờ",
    "chưa từng", "không phải", "đâu có", "không bao giờ",
    # tiếng Anh
    "not", "no", "never", "don't", "dont", "do not", "doesn't", "didn't", "won't",
    "wouldn't", "never want", "don't want", "do not want",
]

# "muốn chết" đứng sau các từ này là cường điệu thường ngày.
HYPERBOLE_BEFORE = {
    "muốn chết": ["đói", "mệt", "nóng", "lạnh", "ngủ", "vui", "sướng", "cười", "thèm",
                  "nhớ", "ngại", "xấu hổ", "ghen", "hồi hộp", "sợ", "đau", "buồn ngủ", "no"],
}

KEYWORD_GROUPS = {
    RiskLevel.CRITICAL: {
        "self_harm": [
            # tiếng Việt
            "tôi muốn chết", "mình muốn chết", "em muốn chết", "tao muốn chết", "anh muốn chết",
            "muốn tự tử", "định tự tử", "sẽ tự tử", "nghĩ đến tự tử", "nghĩ tới tự tử",
            "muốn tự sát", "tự kết liễu", "kết liễu bản thân", "kết liễu đời mình",
            "kết thúc cuộc đời", "kết thúc cuộc sống", "kết thúc tất cả",
            "không muốn sống nữa", "không muốn sống", "chán sống", "không thiết sống",
            "sống không nổi nữa", "không còn lý do để sống", "chết đi cho xong", "chết quách",
            "chết cho rồi", "chết cho xong", "muốn nhảy lầu", "hôm nay là ngày cuối cùng",
            "vĩnh biệt mọi người",
            # tiếng Anh
            "kill myself", "end my life", "take my life", "i want to die", "wanna die",
            "i don't want to live", "i dont want to live", "i can't live anymore",
            "i cant live anymore", "wish i was dead", "better off dead", "rather be dead",
            "i'm going to end it", "im going to end it", "i am going to end it",
            "this is my last day", "goodbye forever", "no reason to live",
            "i'm done with life", "im done with life",
        ],
    },
    RiskLevel.HIGH: {
        "self_harm_ideation": [
            "muốn chết", "tự tử", "tự sát", "tự làm hại bản thân", "tự làm đau bản thân",
            "tự hại", "rạch tay", "cắt tay", "cứa tay", "treo cổ", "uống quá liều",
            "uống hết thuốc", "sống để làm gì", "sống chẳng để làm gì", "sống vô nghĩa",
            "hurt myself", "self harm", "self-harm", "cut myself", "cutting myself",
            "no point in living", "life is pointless", "why am i alive",
            "what's the point of living", "took too many pills", "overdosed",
            "took all my medication",
        ],
        "harm_others": [
            "muốn giết", "giết nó", "giết hắn", "đánh chết nó",
            "kill someone", "going to kill", "want to hurt someone", "i'll kill", "i will kill",
        ],
    },
    RiskLevel.MEDIUM: {
        # Đặt trước emotional_distress: cùng mức MEDIUM thì nhóm khớp trước giữ category.
        # Mơ hồ (nghỉ ngơi hay tự hại?) → bot hỏi lại cho rõ (CrisisLevel.ALERT).
        # "Không chịu nổi nữa" / "can't take it anymore" KHÔNG nằm trong danh sách nào: người ta nói
        # câu này khi cãi nhau, chạy deadline. Có kèm ý chấm dứt / biến mất thì cụm khác sẽ bắt.
        "self_harm_ambiguous": [
            "muốn biến mất", "want to disappear",
            "không gượng nổi nữa", "i can't go on", "i cant go on",
        ],
        "emotional_distress": [
            "tuyệt vọng", "vô vọng", "vô dụng", "vô giá trị", "chẳng còn gì quan trọng",
            "suy sụp", "sụp đổ", "mất kiểm soát", "ghét bản thân", "căm ghét bản thân",
            "tôi là kẻ thất bại", "mình là kẻ thất bại", "không ai quan tâm", "không ai hiểu",
            "chỉ có một mình", "kiệt sức", "quá tải",
            "hopeless", "worthless", "useless", "nothing matters", "falling apart",
            "breaking down", "losing control", "hate myself", "i'm a failure", "im a failure",
            "no one cares", "all alone", "completely alone", "no one understands", "overwhelmed",
        ],
    },
    RiskLevel.LOW: {
        "general_sadness": [
            "buồn quá", "trầm cảm", "chán nản", "tệ quá", "không ổn", "mệt mỏi", "ngày tệ",
            "feeling down", "very sad", "depressed", "miserable", "unhappy", "struggling",
            "not okay", "not doing well", "feeling low", "bad day", "rough day",
        ],
    },
}


def _strip_diacritics(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def _normalize(text: str) -> str:
    """Chữ thường, thống nhất dấu nháy, dấu câu → ' | ' (ranh giới mệnh đề), giữ dấu '."""
    t = unicodedata.normalize("NFC", text.lower())
    t = t.replace("’", "'").replace("‘", "'").replace("`", "'")
    t = re.sub(r"[.,!?;:\n()\[\]\"…]+", " | ", t)
    t = re.sub(r"[^\w\s'|-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _word_in(word: str, text: str) -> bool:
    return re.search(r"(?<![\w'])" + re.escape(word) + r"(?![\w'])", text) is not None


def _negated(before: str) -> bool:
    """Có từ phủ định nguyên vẹn trong vài từ cuối của đoạn trước, cùng mệnh đề?

    Bản không dấu chỉ dùng khi chính đoạn đó được gõ không dấu, để "cha"
    (bố) không bị nhầm với "chả", "chua" không bị nhầm với "chưa".
    """
    clause = before.split("|")[-1]
    window = " ".join(clause.split()[-NEGATION_WINDOW:])
    typed_plain = window == _strip_diacritics(window)
    for neg in NEGATIONS:
        if _word_in(neg, window):
            return True
        if typed_plain and _word_in(_strip_diacritics(neg), window):
            return True
    return False


def _hyperbole(keyword: str, before: str) -> bool:
    words = before.split("|")[-1].split()
    if not words:
        return False
    tail = " ".join(words[-2:])
    for w in HYPERBOLE_BEFORE.get(keyword, []):
        for cand in {w, _strip_diacritics(w)}:
            if tail == cand or tail.endswith(" " + cand):
                return True
    return False


class KeywordFilter:

    def __init__(self):
        # (pattern có dấu, pattern không dấu, keyword gốc, level, category)
        self._rules = []
        for level, groups in KEYWORD_GROUPS.items():
            for category, keywords in groups.items():
                for kw in keywords:
                    kw_n = _normalize(kw)
                    self._rules.append((
                        re.compile(r"(?<![\w'])" + re.escape(kw_n) + r"(?![\w'])"),
                        re.compile(r"(?<![\w'])" + re.escape(_strip_diacritics(kw_n)) + r"(?![\w'])"),
                        kw, level, category,
                    ))

    def check(self, text: str) -> FilterResult:
        t      = _normalize(text or "")
        plain  = _strip_diacritics(t)
        matched, highest, category = [], RiskLevel.SAFE, None

        for pat, pat_plain, kw, level, cat in self._rules:
            hit = False
            for m in pat.finditer(t):
                if not (_negated(t[:m.start()]) or _hyperbole(kw, t[:m.start()])):
                    hit = True
                    break
            if not hit:
                # Bản không dấu: chỉ nhận khi đoạn gốc cũng được gõ không dấu,
                # để "từ từ" không bị khớp thành "tự tử".
                for m in pat_plain.finditer(plain):
                    if t[m.start():m.end()] != m.group(0):
                        continue
                    if not (_negated(t[:m.start()]) or _hyperbole(kw, t[:m.start()])):
                        hit = True
                        break
            if not hit:
                continue
            matched.append(kw)
            if LEVEL_ORDER.index(level) > LEVEL_ORDER.index(highest):
                highest, category = level, cat

        return FilterResult(
            is_flagged=highest != RiskLevel.SAFE,
            risk_level=highest,
            matched_keywords=matched,
            category=category,
        )


keyword_filter = KeywordFilter()
