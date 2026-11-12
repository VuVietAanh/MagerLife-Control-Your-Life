# ============================================================
# So sánh model trả lời trên bộ 20 câu tiếng Việt (tests/eval_vi.json).
# GỌI CLAUDE THẬT — tốn tiền (ước tính vài cent cho 20 câu × 2 model).
#
# Chạy từ thư mục mindspace/, cần ANTHROPIC_API_KEY trong .env:
#   python tests/run_eval.py claude-sonnet-5-5 claude-haiku-5-5 --out eval_result.md
#
# Mỗi câu chạy độc lập (không lịch sử, không DB, không RAG): analyzer chấm
# cảm xúc/ý định/nguy cơ, rồi từng model viết câu trả lời với cùng prompt.
# Thứ tự A/B được xáo ngẫu nhiên mỗi câu; đáp án nằm ở cuối file để chấm mù.
# ============================================================

import argparse
import json
import os
import random
import sys

sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env")

from core.emotion import get_turn_analyzer  # noqa: E402
from core.generator import Generator  # noqa: E402
from core.intent import RESPONSE_STRATEGY, Intent  # noqa: E402
from core.keyword_filter import keyword_filter  # noqa: E402
from core.crisis import risk_mode_of  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="+")
    ap.add_argument("--out", default="eval_result.md")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    cases = json.load(open("tests/eval_vi.json", encoding="utf-8"))
    rng = random.Random(args.seed)
    gens = {m: Generator(model=m) for m in args.models}
    analyzer = get_turn_analyzer()
    lines, key, tokens = ["# Kết quả so sánh (chấm mù)\n"], [], {m: [0, 0, 0, 0] for m in args.models}

    for case in cases:
        msg = case["tin_nhan"]
        a = analyzer.analyze(msg)
        intent = Intent.parse(a.intent)
        risk = risk_mode_of(keyword_filter.check(msg), a.self_harm)
        order = list(args.models)
        rng.shuffle(order)
        lines.append(f"## {case['id']} ({case['loai']}): {msg}\n")
        lines.append(f"_phân tích: intent={intent.value}, self_harm={a.self_harm}, "
                     f"cảm xúc={a.emotion.dominant_emotion}, risk_mode={risk}_\n")
        for label, model in zip("ABCD", order):
            r = gens[model].generate(
                user_input=msg, risk_mode=risk,
                intent_instruction=RESPONSE_STRATEGY[intent]["instruction"],
            )
            tokens[model][0] += r.prompt_tokens
            tokens[model][1] += r.output_tokens
            tokens[model][2] += r.cache_read_tokens
            tokens[model][3] += r.cache_write_tokens
            lines.append(f"**{label}:** {r.response}\n")
        key.append(f"- {case['id']}: " + ", ".join(f"{l}={m}" for l, m in zip("ABCD", order)))
        print(f"{case['id']} xong")

    lines.append("\n---\n## Đáp án\n" + "\n".join(key))
    lines.append("\n## Token\n" + "\n".join(
        f"- {m}: vào {i} (+ đọc cache {cr}, ghi cache {cw}), ra {o}"
        for m, (i, o, cr, cw) in tokens.items()
    ))
    open(args.out, "w", encoding="utf-8").write("\n".join(lines))
    print(f"Đã ghi {args.out}")


if __name__ == "__main__":
    main()
