# MagerLife Persistence Plan

Mục tiêu của lớp persistence là tách UI/Agent khỏi `localStorage`. Frontend hiện vẫn chạy local, nhưng contract đã chuẩn bị để thay bằng backend thật.

## Bảng chính

| Bảng | Vai trò |
| --- | --- |
| `app_users` | Tài khoản, role `user/admin`, gói `free/pro`, trạng thái hoạt động. |
| `user_profiles` | Hồ sơ nền: tuổi, giới tính, cân nặng, chiều cao, thu nhập, budget ăn, mục tiêu, trọng số Agent. |
| `user_jars` | Các hũ tài chính, bao gồm hũ cố định `Ăn uống`. |
| `transactions` | Thu/chi theo hũ, dùng cho budget guard và Finance Agent. |
| `food_library_items` | Kho món Admin + kho món cá nhân Pro + candidate ngoài/API. |
| `nutrition_meal_logs` | Nhật ký ăn uống đã được hệ thống chấp nhận ghi vào hồ sơ. |
| `pending_nutrition_api_requests` | Món chưa đủ chắc, API/LLM trả candidate và hệ thống kiểm tra hợp lý trước khi ghi. |
| `agent_events` | Mọi thay đổi quan trọng từ chat/profile/food/budget. |
| `agent_decision_logs` | Quyết định nội bộ của Agent: input, rule, API call, output, confidence. |
| `agent_training_records` | Dữ liệu candidate để lọc/gắn nhãn/train lại model nền. |

## Route ghi dữ liệu

| Route | Bảng tác động |
| --- | --- |
| `POST /profile/update` | `user_profiles`, `agent_events`, `agent_training_records` |
| `POST /chat/turn` | Tùy nội dung: profile patch, pending nutrition, meal log, agent event |
| `POST /nutrition/resolve-food` | `pending_nutrition_api_requests`, sau khi hợp lý thì `nutrition_meal_logs` |
| `POST /agent/events` | `agent_events`, `agent_training_records` |
| `POST /persistence/sync` | Sync snapshot local/demo lên backend |
| `GET /admin/analytics` | Đọc `app_users`, `food_library_items`, `agent_events`, `agent_training_records` |

## Agent rule trước API

Các rule bắt buộc nên chạy local/backend deterministic trước khi gọi LLM:

- Quy đổi tiền tệ theo gói và currency user đã chọn.
- Quy đổi `kg -> g`, `l -> ml`; chỉ dùng `g/kg/ml/l` làm đơn vị chuẩn trong kho.
- Kiểm tra budget ăn uống theo tháng/ngày/bữa.
- Kiểm tra kcal đã nạp so với TDEE/mục tiêu.
- Kiểm tra mục tiêu ngược nhau.
- Phân quyền Admin/Pro/Free.
- Kiểm tra khẩu phần đời thường có hợp lý không, ví dụ `4 quả trứng = 70g` là thấp bất thường.

## Khi user chat món ăn

1. Parse local.
2. Match kho cá nhân Pro.
3. Match kho Admin.
4. Nếu có đơn vị chuẩn `g/kg/ml/l`, tính trực tiếp.
5. Nếu dùng đơn vị đời thường như `quả`, `bát`, `tô`, `phần`, đưa qua API/LLM để ước tính khẩu phần.
6. Backend kiểm tra hợp lý:
   - Nếu hợp lý: ghi `nutrition_meal_logs`.
   - Nếu bất thường: trả cảnh báo, chưa ghi hoặc ghi với flag cần review.
7. Ghi `agent_events` và `agent_training_records`.

## Dữ liệu train Agent

Mỗi record nên giữ:

- `input`: text user, profile lúc đó, hũ/budget/kcal state.
- `rules_fired`: rule nào chạy.
- `api_called`: có gọi LLM/API không.
- `output`: đề xuất/cảnh báo/cập nhật.
- `accepted`: user có chấp nhận/hành động theo không.
- `label`: nhãn sau review hoặc từ hành vi.

Không train lại riêng cho từng user ngay. Hướng đúng:

1. Tạo model nền từ synthetic + rule-generated data.
2. Thu thập dữ liệu thật từ nhiều user.
3. Lọc/gắn nhãn.
4. Train lại model nền theo batch.
5. Cá nhân hóa từng user bằng profile weights/memory, không fine-tune riêng mỗi người.
