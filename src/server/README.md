# MagerLife API Server

Backend nhẹ để test contract trước khi nối DB thật. Nếu có API key trong `.env`, server sẽ gọi LLM; nếu chưa có key hoặc LLM lỗi, server tự fallback về mock response.

Chạy:

```bash
npm run api:server
```

Mặc định server chạy tại:

```text
http://127.0.0.1:8787
```

Routes hiện có:

- `POST /chat/turn`
- `POST /nutrition/resolve-food`
- `POST /profile/update`
- `GET /weather`
- `POST /agent/events`
- `POST /persistence/sync`
- `GET /admin/analytics`

Các route này giữ shape request/response theo `src/app/services/apiContracts.ts`.

## API keys

Copy `.env.example` thành `.env`, sau đó điền key:

```env
MAGERLIFE_LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
MAGERLIFE_ENABLE_REAL_LLM=true

# Local demo persistence
MAGERLIFE_DB_DRIVER=memory

# Real Postgres/Supabase persistence
DATABASE_URL=postgres://user:password@host:5432/database
DATABASE_SSL=true
```

Không đưa key vào frontend hoặc file `VITE_...`. `VITE_MAGERLIFE_API_BASE_URL` chỉ là URL public của backend local, không phải secret.

Provider `xai` vẫn có thể dùng sau này nếu đổi `.env`, nhưng mặc định hiện tại là Groq.

## LLM-enabled routes

- `POST /chat/turn`: gọi Chat Agent khi local rule không đủ.
- `POST /nutrition/resolve-food`: ước tính món chưa có trong kho, vẫn cần user xác nhận.
- `POST /profile/update`: trích xuất thêm profile patch từ free text nếu có `sourceText`.

Route weather hiện vẫn dùng mock ở server này; frontend hiện dùng Open-Meteo trực tiếp không cần key.

## Persistence draft

Schema DB nháp nằm ở:

```text
docs/database/schema.sql
```

Kế hoạch lưu dữ liệu và train Agent nằm ở:

```text
docs/database/persistence-plan.md
```

Hiện `POST /persistence/sync` và `GET /admin/analytics` dùng in-memory store để test contract. Khi nối DB thật, thay phần store này bằng repository Postgres/Supabase nhưng giữ nguyên shape request/response trong `src/app/services/apiContracts.ts`.

Server đã có adapter ở `src/server/dbRepository.mjs`:

- `MAGERLIFE_DB_DRIVER=memory`: chạy demo không cần DB.
- `MAGERLIFE_DB_DRIVER=postgres`: dùng `DATABASE_URL`.

Nếu dùng Postgres adapter, cài driver:

```bash
npm install pg
```
