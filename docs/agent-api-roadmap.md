# MagerLife Agent/API Roadmap

## Mục tiêu

MagerLife không chỉ là app gọi API sinh câu trả lời. Hệ thống được tách thành các lớp:

1. UI thu thập dữ liệu người dùng.
2. Rule engine xử lý nhanh các quyết định rõ ràng.
3. Food/Nutrition resolver ưu tiên kho dữ liệu chuẩn.
4. API/LLM chỉ xử lý phần không chắc chắn hoặc cần reasoning.
5. Agent event log ghi lại hành vi để lọc, gắn nhãn và train lại model nền.

## Luồng chat món ăn

1. User chat món ăn.
2. Hệ thống tìm trong kho cá nhân Pro.
3. Nếu không có, tìm trong kho Admin.
4. Nếu vẫn không có, tạo `nutrition_api_pending`.
5. API/LLM trả candidate.
6. User hoặc Admin xác nhận.
7. Kết quả mới được ghi vào nhật ký kcal.

## Dữ liệu phục vụ train

Nguồn dữ liệu hiện có:

- `agent events`: thay đổi profile, món đã ghi, món pending, đổi preference.
- `food library`: món chuẩn Admin và món cá nhân Pro.
- `profile signals`: mục tiêu, ngân sách, kcal, lối sống, ưu tiên.
- `meal decisions`: model score, budget guard, kcal fit, time pressure.

Giai đoạn đầu không train lại theo từng user. Hướng đúng là:

1. Tạo model nền từ synthetic data và rule features.
2. Thu event thật từ người dùng.
3. Gắn nhãn dữ liệu tốt/xấu.
4. Fine-tune hoặc train router nhỏ theo batch.
5. Cá nhân hóa bằng profile weights, không fine-tune model riêng cho từng user.

## API contracts

Định nghĩa tại:

```text
src/app/services/apiContracts.ts
```

Facade frontend dùng để gom các hàm trước khi nối backend:

```text
src/app/services/magerLifeApiFacade.ts
```

API base URL dùng chung:

```text
src/app/services/apiConfig.ts
```

Frontend đọc `VITE_MAGERLIFE_API_BASE_URL`, fallback local là `http://127.0.0.1:8787`.

Decision rule/log service:

```text
src/app/services/agentDecisionService.ts
```

Backend/data schema:

```text
docs/backend-data-schema.md
```

Routes:

- `GET /health`
- `POST /chat/turn`
- `POST /nutrition/resolve-food`
- `POST /profile/update`
- `GET /weather`
- `POST /agent/events`

Mock server:

```bash
npm run api:mock
```

Trong tab `My Brain`, nút `Sync API` hiện gửi event log tới mock server tại `http://127.0.0.1:8787/agent/events`. Khi nối backend thật, đổi base URL ở facade/UI sang API thật hoặc biến môi trường.

LLM provider đầu tiên đang dùng là Groq qua biến môi trường `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`. API key chỉ nằm ở server `.env`, không đưa vào frontend. Provider `xai` vẫn còn khe fallback nếu đổi sau này.

`/profile/update` đã được nối kiểu nền: UI cập nhật local trước, sau đó backend/Groq trích xuất thêm từ `sourceText` và trả patch bổ sung để merge lại profile nếu có field mới.

## Việc cần làm khi nối backend thật

- Thay `localStorage` bằng DB cho account/profile/food/event.
- Dùng `callMagerLifeApi` để gọi backend theo contract.
- Dùng `magerLifeApiFacade` làm lớp trung gian, tránh component gọi API trực tiếp.
- Thêm auth token.
- Thêm queue xử lý pending food.
- Thêm admin approval flow cho candidate từ LLM/API.
- Thêm export dataset theo schema train.
