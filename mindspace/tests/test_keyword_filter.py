# Chạy: python tests/test_keyword_filter.py  (từ thư mục mindspace/)
import os, sys
sys.path.insert(0, os.getcwd())
from core.keyword_filter import keyword_filter, RiskLevel as R

CASES = [
    # (câu, mức mong đợi)
    ("Tôi muốn chết", R.CRITICAL),
    ("toi muon chet", R.CRITICAL),
    ("Mình không muốn sống nữa", R.CRITICAL),
    ("dạo này chán sống quá", R.CRITICAL),
    ("Tôi không muốn chết đâu, chỉ buồn thôi", R.SAFE),
    ("Đói muốn chết", R.SAFE),
    ("mệt muốn chết luôn á", R.SAFE),
    ("Cứ từ từ thôi", R.SAFE),
    ("cha tôi muốn tự tử", R.CRITICAL),
    ("Không chịu nổi nữa rồi", R.SAFE),                      # câu than thường ngày
    ("mẹ cấm mình quen anh ấy. mình không chịu nổi nữa", R.SAFE),
    ("không gượng nổi nữa rồi", R.MEDIUM),                    # mơ hồ → hỏi lại một lần
    ("không chịu nổi nữa, mình muốn tự tử", R.CRITICAL),     # vẫn bắt phần rõ ràng
    ("Mình thấy tuyệt vọng", R.MEDIUM),
    ("Hôm nay trời đẹp", R.SAFE),
    ("Mệt quá, tôi muốn chết", R.CRITICAL),
    ("Không ai hiểu mình cả", R.MEDIUM),
    ("đôi khi chỉ muốn biến mất một thời gian", R.MEDIUM),   # mơ hồ → chỉ "chú ý"
    ("muốn biến mất, không muốn sống nữa", R.CRITICAL),      # vẫn bắt phần rõ ràng
    # tiếng Anh — các lỗi cũ
    ("I don't want to live anymore", R.CRITICAL),
    ("I can't go on", R.MEDIUM),
    ("I'm going to end it tonight", R.CRITICAL),
    ("I'm done with life", R.CRITICAL),
    ("I know I want to die", R.CRITICAL),
    ("Without her I wanna die", R.CRITICAL),
    ("I don't want to die", R.SAFE),
    ("I never want to kill myself", R.SAFE),
    ("No, I want to die", R.CRITICAL),
    ("I’m done with life", R.CRITICAL),
]

fail = 0
for text, expect in CASES:
    got = keyword_filter.check(text).risk_level
    ok = got == expect
    fail += not ok
    print(("PASS" if ok else "FAIL"), f"{expect.value:>8} got {got.value:>8} | {text}")
print("failures:", fail)
sys.exit(1 if fail else 0)
