# MindSpace

Chatbot tâm sự tiếng Việt, một người dùng. Là service Python riêng nằm trong repo MagerLife; sau này tab "Nói chuyện/Tâm sự" của MagerLife sẽ gọi sang đây qua API server-to-server.

Database riêng (project Neon riêng), không dùng chung với MagerLife: hội thoại tâm lý là dữ liệu nhạy cảm nhất trong cả hai app.

## Luồng một tin nhắn

```text
tin nhắn
  ├─► keyword filter (code, tiếng Việt có/không dấu + tiếng Anh)
  ├─► TurnAnalyzer — Claude Haiku 5.5, đọc cả tin cuối của bot:
  │        8 cảm xúc Plutchik, ý định, self_harm (none / ambiguous / explicit)
  ├─► EMA cảm xúc nhiều lượt (một nguồn: bảng emotion_state)
  ├─► CrisisChecker → risk_mode
  │        high  = tự hại rõ (từ khoá CRITICAL/HIGH hoặc explicit)
  │        watch = mơ hồ ("muốn biến mất", "không chịu nổi nữa") hoặc trả lời nửa vời ("chưa đến mức đó")
  │        care  = buồn kéo dài / cảm xúc rất nặng / lượt ngay sau tín hiệu tự hại
  │        none
  └─► Generator — Claude Sonnet 5.5, prompt tiếng Việt → lưu Postgres
```

- Cách nói chuyện: **nghe trước, rồi mới thật lòng**. Lúc đầu phản chiếu và hỏi để hiểu; khi đã hiểu hoặc khi người dùng bế tắc / hỏi nên làm gì (intent `guidance`) thì nói góc nhìn, được nhẹ nhàng không đồng ý khi họ tự hạ thấp mình, gợi 1–2 việc nhỏ cụ thể, khoảng 120 chữ. Không bắt buộc kết bằng câu hỏi; tạm biệt hoặc vừa ra quyết định thì không hỏi thêm.
- Bị chê cách nói (intent `feedback`: "nói như robot") thì không phải muốn dừng. Bot nhận ngắn rồi đổi giọng.
- Người dùng bảo "đừng hỏi thêm" thì cả cuộc trò chuyện không hỏi nữa, trừ câu hỏi an toàn. Phát hiện bằng regex trên các tin của cuộc đó.
- Bot không tự nhận là chỗ dựa ("mình ở đây") với người đang cô đơn. Khi để cửa mở, người thật được nhắc trước, bot sau.
- Đã có tín hiệu mơ hồ, cộng với tình trạng kéo dài nhiều tuần hoặc nhiều tháng: bot gợi một lần việc gặp chuyên gia trước khi cuộc trò chuyện kết thúc. Luật này nằm trong prompt, chưa có code đếm.
- Chỉ nghe: khi người dùng nói rõ chỉ muốn được nghe (intent `listen_only`), bot không khuyên trong suốt cuộc trò chuyện, cho đến khi họ tự hỏi ý kiến (`guidance` / `question`). Trạng thái đọc từ `messages.intent`, cột này giờ lưu ý định (trước đây lưu nhầm cảm xúc, không chỗ nào đọc).
- `watch`: bot ghi nhận một câu rồi hỏi thẳng một lần xem họ có nghĩ đến chuyện làm hại bản thân không. Trả lời nửa vời hoặc phủ nhận thì ghi nhận, để cửa mở bằng lời, **chưa đưa số đường dây**. Số chỉ đưa khi họ nói rõ, khi tín hiệu mơ hồ quay lại lần hai, hoặc khi họ tự hỏi (luật nằm trong prompt, model tự đọc lịch sử để biết đã hỏi chưa).
- `high`: hỏi họ có an toàn không, có ai ở gần không, và luôn đưa ít nhất một nguồn hỗ trợ theo giờ Việt Nam (pipeline truyền `local_time`): trong giờ là Ngày Mai; ngoài giờ là người ở gần, kèm 115. Có người thân ở nhà thì khuyến khích nói với họ ngay. Người dùng tạm biệt khi đang ở `high` thì không hỏi thêm: một câu ấm, ở gần người thân, 115 nếu nặng hơn.
- Quay lại trong 72 giờ sau khi đã nói rõ ý tự hại (ở cuộc trò chuyện khác): 2 lượt đầu của cuộc mới có ghi chú, kèm mốc thời gian như "hôm qua (khoảng 22 giờ trước)", để bot hỏi thăm nhẹ một lần nếu tự nhiên, không mở lời bằng chuyện đó. Nguồn là `emotion_state.last_crisis_at`. Quá 72 giờ thì giá trị này bị xoá ở lượt nhắn kế tiếp.
- `care`: chỉ ấm hơn, chậm lại; không nhắc chuyện an toàn hay đường dây. Buồn nhiều không đồng nghĩa với nguy cơ tự hại.
- Sau một lượt nói rõ ý tự hại, `high` được **giữ thêm 3 lượt** (trong vòng 6 giờ, xuyên các cuộc trò chuyện) dù tin sau nghe nhẹ hơn, rồi `care` một lượt. Trạng thái nằm trong DB: `messages.crisis_flagged` giờ nghĩa là "lượt đó người dùng nói rõ ý tự hại". Ở `high`, bot hỏi từng câu một (an toàn → ai ở gần → cách cụ thể / đồ vật) và làm theo câu trả lời; phương án dự phòng luôn là người thật hoặc đường dây, không phải bot.
- Than mệt chung chung ("mệt với tất cả", "không chịu nổi nữa") không bị coi là tín hiệu tự hại. "Không gượng nổi nữa", "I can't go on" là mơ hồ (`watch`).
- Người dùng xin đổi ngôn ngữ thì bot đổi; câu kiểu "bỏ qua hướng dẫn" không được bình luận và không tắt phần an toàn.
- Cache: system chỉ chứa phần cố định; ghi chú từng lượt (`<boi_canh>`) nằm trong tin user cuối, lời người dùng bọc trong `<tin_nhan>` (thẻ người dùng tự gõ bị gỡ). Điểm cache đặt ở tin cuối của lịch sử nên lịch sử được đọc lại từ cache.
- Keyword filter là code, gộp vào CrisisChecker, nên lời nhắn kiểu "bỏ qua mọi quy tắc" không tắt được nó. Khi Claude lỗi, analyzer cũng dùng chính bộ lọc này làm dự phòng.
- Claude lỗi hoặc từ chối → câu trả lời soạn sẵn theo `risk_mode` (mức `high` có 115 và đường dây Ngày Mai), API không trả 500.
- Generator bật server-side fallback (`fallbacks: "default"` + beta `server-side-fallback-2026-07-01`): nếu Sonnet từ chối vì bộ lọc an toàn, Anthropic tự chạy lại trên model dự phòng.

### Đường dây hỗ trợ (`HOTLINES` trong `core/generator.py`)

| Số | Giờ | Nguồn, ngày kiểm tra |
| --- | --- | --- |
| Ngày Mai 096 306 1414 (khủng hoảng tâm lý, trầm cảm) | 13:00–20:30, thứ Tư → Chủ nhật | [duongdaynongngaymai.vn](https://duongdaynongngaymai.vn), 02/11/2026 |
| 111 Tổng đài quốc gia bảo vệ trẻ em | 24/7, miễn phí | theo kết quả tìm kiếm 02/11/2026, chưa mở trang chính thức |
| 115 Cấp cứu | 24/7 | |

Số và giờ có thể đổi: kiểm tra lại định kỳ. Chưa tìm được đường dây tâm lý nào chắc chắn chạy 24/7, nên ngoài giờ bot hướng tới người tin cậy ở gần hoặc 115. Ứng viên: 1900 1267 (Bệnh viện Tâm thần TP.HCM, mô hình "cấp cứu trầm cảm" phối hợp 115). Theo [VnExpress 22/07/2022](https://vnexpress.net/cap-cuu-tram-cam-o-tp-hcm-4490877.html) đây là thử nghiệm ở TP.HCM, và chỉ [một bài 2025](https://alobacsi.com/hotline-cap-cuu-tram-cam-hoat-dong-24-7-mot-cuoc-goi-co-the-cuu-mot-mang-nguoi.html) ghi là 24/7. Đầu số 1900 có tính phí. Chưa đưa vào prompt; cần gọi thử để xác nhận.

### Dữ liệu nhạy cảm

- **Thời hạn lưu: 30 ngày kể từ tin nhắn cuối của mỗi cuộc trò chuyện.** Quá hạn thì cuộc đó bị xoá hẳn, gồm tin nhắn và `conversation_emotion` (`purge_expired_conversations` trong `db/crud.py`).
  - Việc xoá chạy mỗi lần gọi `/api/start` hoặc `/api/conversation/new`, nên nếu không ai mở app thì dữ liệu quá hạn vẫn nằm đó tới lần mở sau.
  - Muốn xoá đúng hạn dù không ai dùng, cần thêm một Vercel Cron gọi hằng ngày. Việc này chưa làm, sẽ làm cùng bước deploy.
- `emotion_state.last_crisis_at` tự xoá sau 72 giờ.
- `emotion_state` (EMA cảm xúc gộp theo user) không bị xoá theo cuộc trò chuyện.
- Cần ghi các điểm trên vào chính sách quyền riêng tư của app.

| File | Vai trò |
| --- | --- |
| `app.py` | FastAPI: xác thực token MagerLife, hội thoại, chat, admin |
| `pipeline.py` | Luồng xử lý ở trên |
| `core/llm.py` | Client Anthropic dùng chung, chọn model qua env |
| `core/emotion.py` | TurnAnalyzer (Haiku, structured output) |
| `core/generator.py` | Prompt tiếng Việt, gọi Sonnet, câu soạn sẵn |
| `core/keyword_filter.py` | Từ khoá nguy cơ, phủ định, cường điệu ("đói muốn chết") |
| `core/context.py` | EMA, đổi cảm xúc, gợi ý ý khi cảm xúc cao |
| `core/crisis.py` | Gộp từ khoá + self_harm + cảm xúc thành `risk_mode` |
| `core/retrieval.py`, `core/embedding*.py`, `data/` | RAG, tắt mặc định |
| `hf_space/` | Code HF Space phục vụ embedding |

## Chi phí

Mỗi tin nhắn gọi 2 lần: Haiku 5.5 (phân tích, rất rẻ) và Sonnet 5.5 (trả lời). Giá theo [bảng giá Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) ngày 01/11/2026: Sonnet 5.5 $2 / $10, Haiku 5.5 $0,10 / $0,50 mỗi triệu token vào/ra. Đo thử ngày 02/11/2026: khoảng 0,005–0,01 USD mỗi tin nhắn với Sonnet, tăng theo độ dài lịch sử. Đổi model bằng `MINDSPACE_CHAT_MODEL` / `MINDSPACE_ANALYZER_MODEL`.

## Chạy local

```bash
cd mindspace
python -m venv venv
venv\Scripts\pip install -r requirements.txt     # Windows
cp .env.example .env                              # điền giá trị thật, không commit
venv\Scripts\uvicorn app:app --reload             # http://127.0.0.1:8000
```

## Kỹ năng trò chuyện và RAG

Kỹ thuật trò chuyện được chắt lọc từ tài liệu tiếng Anh trong `data/knowledge_base/` (Rogers & Farson *Active Listening*, LP4 *Empathy and Active Listening*, PositivePsychology.com: counseling techniques, attachment, toolkit) rồi viết thẳng vào phần prompt cố định trong `core/generator.py` (được prompt cache). Lý do bỏ RAG lúc chạy:

- 194/249 đoạn trong index cũ là WHO mhGAP Intervention Guide 2.0: hướng dẫn lâm sàng cho nhân viên y tế, có liều thuốc. Không hợp với bot tâm sự.
- Kỹ thuật lắng nghe áp dụng cho mọi câu, nên nằm trong prompt hợp hơn là tra theo độ giống của tin nhắn.
- Bỏ được HF Space và FAISS khỏi đường chạy; prompt ngắn hơn khoảng 4.000 token mỗi lượt.

Code RAG vẫn giữ (FAISS, index trong `data/`). Khi có kho kiến thức thật (bài nghiên cứu, tiếng Anh cũng được) thì bật lại bằng `MINDSPACE_RAG=1`; nên loại mhGAP khỏi index trước và cân nhắc `pgvector` trên Neon.

## Kiểm tra

```bash
venv\Scripts\python tests/test_keyword_filter.py    # 28 câu nguy cơ / phủ định / cường điệu
venv\Scripts\python tests/test_auth.py              # phân quyền + token MagerLife, pipeline giả
venv\Scripts\python tests/test_pipeline_offline.py  # E1–E6 với client Claude giả, không tốn tiền
venv\Scripts\python tests/run_eval.py claude-sonnet-5-5 claude-haiku-5-5   # GỌI CLAUDE THẬT, tốn tiền
venv\Scripts\python tests/run_scenarios.py [S1 S3 …]                        # GỌI CLAUDE THẬT: kịch bản nhiều lượt, ghi scenario_result.md
venv\Scripts\python tests/run_simulated.py [U1 U2 …]                        # GỌI CLAUDE THẬT: Haiku đóng vai người dùng, ghi simulated_result.md
```

Cần chạy bằng `venv`: code dùng `anthropic>=2.3.0` (tham số `fallbacks`). Python global trên máy có thể đang là bản SDK cũ hơn và sẽ báo `unexpected keyword argument 'fallbacks'`.

- `run_scenarios.py`: lời người dùng viết sẵn (S1–S7). S6 là người dùng cáu chê bot. S7 là quay lại hôm sau: runner lùi mọi mốc giờ trong DB của user để giả lập thời gian trôi.
- `run_simulated.py`: Haiku đóng vai người dùng (U1–U3), phản ứng theo câu bot vừa nói. Kết quả mỗi lần chạy mỗi khác, dùng để tìm lỗi chứ không để so số.

`run_eval.py` chạy 20 câu trong `tests/eval_vi.json` qua từng model, xáo thứ tự A/B và ghi `eval_result.md` để chấm mù.

## Biến môi trường

Xem `.env.example`. Bắt buộc: `DATABASE_URL`, `MINDSPACE_SHARED_SECRET`, `MINDSPACE_CORS_ORIGINS`, `ANTHROPIC_API_KEY`. `AI_SERVICE_URL` chỉ cần khi `MINDSPACE_RAG=1`.

## Giao diện

Tab "Tâm sự" của MagerLife (`src/app/views/mindspace/`, client `src/app/services/mindspaceClient.ts`).

- Local: frontend gọi thẳng `http://127.0.0.1:8000` (`VITE_MINDSPACE_API_BASE_URL`), cần `MINDSPACE_CORS_ORIGINS=http://localhost:5173`.
- Production: frontend gọi `/mindspace/*` cùng domain MagerLife; `vercel.json` của MagerLife rewrite sang deployment MindSpace (thêm ở bước deploy). Mọi response `/api/*` có `Cache-Control: no-store` để CDN không cache tin nhắn.
- `POST /api/conversation/new` dùng lại cuộc trống gần nhất, nên mở tab nhiều lần không sinh cuộc rỗng.
- Giờ trả về dạng ISO UTC (`...Z`); frontend hiển thị theo giờ máy người dùng.

## Đăng nhập

MindSpace không có đăng nhập riêng; tài khoản là tài khoản MagerLife.

```
Đăng nhập MagerLife ──► token phiên MagerLife (7 ngày)
POST /api/mindspace/token (Node) ──► JWT HS256 {iss: magerlife, aud: mindspace, sub: email, role}, hạn 1 giờ
Frontend gọi MindSpace với JWT đó ──► app.py kiểm tra chữ ký, iss, aud, exp ──► tìm user theo email, lần đầu thì tạo
```

- `MINDSPACE_SHARED_SECRET` (≥ 32 ký tự) phải giống hệt nhau ở project MagerLife và project MindSpace, và khác `MAGERLIFE_SESSION_SECRET`. Lộ secret này thì chỉ giả được token MindSpace, không giả được phiên MagerLife.
- Thiếu hoặc lệch secret: Node trả 503 `MINDSPACE_NOT_CONFIGURED`, hoặc MindSpace trả 401 cho mọi request.
- Role (`admin`/`user`) lấy theo `MAGERLIFE_ADMIN_EMAILS` phía MagerLife, cập nhật vào DB MindSpace ở mỗi request.
- Admin MindSpace vẫn khóa được user (`is_active`), có hiệu lực ngay dù token còn hạn.
- Token hết hạn thì MindSpace trả 401, frontend xin token mới.

## Deploy (chưa làm)

Dự kiến: một project Vercel riêng trỏ vào repo GitLab MagerLife với Root Directory = `mindspace/`, độc lập với project Vercel của MagerLife. Cần kiểm tra lại tài liệu Vercel về monorepo trước khi làm. Project Vercel MindSpace hiện tại vẫn deploy từ repo GitHub cũ.

## Còn tồn

- Nếu bật lại RAG: embedding vẫn là `all-MiniLM-L6-v2` (tiếng Anh), `hf_space/requirements.txt` là bản copy cũ cần dọn.
- Không còn giao diện riêng: giao diện là tab "Tâm sự" của MagerLife. Ảnh nền trong `static/backgrounds/` vẫn giữ, lấy danh sách qua `GET /api/backgrounds`.
- Keyword filter chỉ khớp theo cụm từ: câu tách rời như "muốn biến mất rồi chết đi" không bị bắt, phải dựa vào Haiku chấm `explicit`.
- Cột `users.password_hash` không còn dùng nhưng vẫn để trong bảng; xoá cột cần migration, làm khi nào có migration khác.
