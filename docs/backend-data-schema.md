# MagerLife Backend Data Schema

Tài liệu này chốt schema tối thiểu trước khi nối API/backend thật. Frontend hiện đang chạy bằng local state/localStorage, nhưng backend nên giữ cùng cấu trúc để không phải viết lại UI.

## UserProfile

Nguồn chính cho mọi agent.

Field cốt lõi:

- `id`, `email`, `username`, `passwordHash`
- `role`: `user | admin`
- `subscriptionPlan`: `free | pro`
- `name`, `birthday`, `gender`, `weight`, `height`
- `currency`: `VND | USD`
- `salary`, `foodMonthlyBudget`
- `currentPriority`, `budgetStyle`, `dietPreference`, `trainingHabit`, `lifestyle`
- `goalSummary`, `goalGroups`
- `calorieNote`
- `preferenceWeights`
- `extractedSignals`
- `nutritionTrackingMode`, `nutritionDietMode`, `nutritionDietModeChanges`
- `customFoodItems`
- `nutritionMeals`
- `pendingNutritionApiRequests`

Rule:

- Free không được tạo món cá nhân.
- Pro được tạo món cá nhân, nhưng chỉ dùng cho chính user đó.
- Admin quản lý kho chuẩn hệ thống.

## FoodLibraryItem

Dùng cho kho món Admin và kho cá nhân Pro.

Field cốt lõi:

- `id`, `name`, `aliases`
- `servingGram`, `servingUnit`: chỉ dùng `g | kg | ml | l`
- `kcalPer100g`, `proteinPer100g`, `carbsPer100g`, `fatPer100g`, `fiberPer100g`
- `tags`
- `source`: `admin | user`
- `ownerEmail`
- `updatedAt`

Rule quy đổi:

- `kg -> g`
- `l -> ml`
- `g` và `ml` không tự quy đổi chéo nếu không có density.
- Khi user chat món, ưu tiên kho cá nhân Pro trước, sau đó kho Admin.

## NutritionMealLog

Nhật ký món đã được xác nhận.

Field cốt lõi:

- `id`, `meal`: `Sáng | Trưa | Tối | Phụ`
- `name`
- `kcal`
- `carbs`, `protein`, `fat`, `fiber`
- `createdAt`
- `source`: `user_chat | admin_library | user_library | llm_estimate | external_api`

Rule:

- Chỉ ghi log sau khi đã match kho hoặc user xác nhận candidate API/LLM.
- Free chỉ cần kcal và tổng macro cơ bản.
- Pro có thể xem/chỉnh chi tiết macro theo món.

## PendingNutritionApiRequest

Hàng chờ cho món không có trong kho.

Field cốt lõi:

- `id`, `text`, `meal`
- `status`: `pending | resolved | rejected`
- `createdAt`
- `candidates`
- `resolvedBy`: `user | admin | api | llm`

Flow:

1. User chat món.
2. Không match kho cá nhân/Admin.
3. Tạo pending request.
4. API/LLM trả candidate.
5. User xác nhận hoặc từ chối.
6. Nếu xác nhận, ghi `NutritionMealLog`.

## AgentDecisionLog

Dữ liệu để debug, giải thích và train lại agent.

Field cốt lõi:

- `id`
- `agent`: `Meal Agent | Finance Agent | Planner Agent | Chat Agent | Profile Agent`
- `input`
- `rulesFired`
- `apiCalled`
- `route`
- `suggestion`
- `confidence`
- `userAction`: `pending | accepted | rejected | not_required`
- `factors`
- `createdAt`

Rule logging:

- Luôn ghi rule local đã chạy, kể cả khi không gọi API.
- Nếu có API/LLM, ghi rõ `apiCalled = true`.
- Khi user xác nhận/từ chối, cập nhật `userAction`.

## AgentTrainingSample

File export JSONL từ tab `My Brain` dùng schema:

- `input`: câu/nguồn sự kiện gốc.
- `context.eventType`: loại event.
- `context.profileEmail`: user tạo event.
- `context.payload`: dữ liệu đi kèm tại thời điểm event.
- `label.action`: hành động suy ra như `log_nutrition`, `update_profile`, `agent_decision`.
- `label.accepted`: `true | false | null`.
- `metadata.schemaVersion`: hiện là `magerlife.training.v1`.

Mục tiêu của file này không phải train ngay lập tức, mà là tạo dữ liệu có cấu trúc để lọc, gắn nhãn và train batch sau khi có đủ tương tác thật.

## Local Rules Bắt Buộc

Các rule này phải chạy trước API:

- Quy đổi tiền và định dạng tiền.
- Quy đổi đơn vị `kg/g/ml/l`.
- Check quyền `free/pro/admin`.
- Check món trong kho cá nhân Pro.
- Check món trong kho Admin.
- Check kcal ngày: `ok | near_limit | over_limit`.
- Check ngân sách ăn uống/tháng và chia đều 30 ngày.
- Check mục tiêu ngược nhau trong onboarding.
- Tạo event log cho thay đổi profile, món ăn, pending API, preference và agent decision.

## API Boundary

API/LLM chỉ nên xử lý khi:

- User nhập món không có trong kho.
- User nhập thông tin tự do ở mục `Khác` cần trích xuất ý định.
- Cần giải thích trade-off phức tạp giữa sức khỏe, tiền và lịch.
- Cần dự báo/thời tiết/tỷ giá real-time.

Không dùng API cho các phép tính chắc chắn như kcal guard, quy đổi đơn vị, quyền gói, định dạng tiền.
