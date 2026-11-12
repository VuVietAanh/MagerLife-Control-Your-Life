# MagerLife

MagerLife là dashboard cá nhân kèm trợ lý AI dạng chat. App dành cho một chủ sở hữu: sign-up đóng với mọi email trừ các email cấu hình trên server.

## Tính năng

- **Dashboard:** đồng hồ, lịch (kèm âm lịch), thời tiết, planner trong ngày, thanh trạng thái người dùng, theo dõi kcal và bữa ăn.
- **Chat assistant:** trò chuyện, ghi bữa ăn từ câu chữ tự do, cập nhật hồ sơ.
- **Tâm sự:** chatbot tâm sự MindSpace (service Python riêng trong `mindspace/`), dùng chung tài khoản MagerLife.
- **Jars:** hũ ngân sách tự định nghĩa (theo % hoặc số tiền) và sổ chi tiêu, VND hoặc USD.
- **Food library:** admin quản lý kho món chung; món cá nhân chỉ chủ sở hữu thấy.
- **My Brain:** xem, xác nhận và xóa những gì trợ lý ghi nhớ.
- **Account:** hồ sơ và cấu hình AI provider (Mock, Ollama, Groq, OpenAI, xAI).

## Cấu trúc code

| Thư mục | Nội dung |
| --- | --- |
| `src/app/App.tsx` | State của app, khôi phục phiên, chuyển tab |
| `src/app/views/<tab>/` | Mỗi tab một thư mục: `dashboard`, `finance`, `food`, `account`, `brain`, cùng `auth` |
| `src/app/layout/` | Header, thanh tab, error boundary cho từng view |
| `src/app/ui/`, `lib/`, `hooks/`, `data/` | Component dùng chung, hàm thuần (định dạng, âm lịch, tách câu bữa ăn), hooks, dữ liệu khởi tạo |
| `src/app/services/`, `models/` | API client, logic nghiệp vụ, kiểu dữ liệu |
| `src/server/` | Node API, chạy local và qua `api/[...path].js` trên Vercel |
| `docs/database/` | Schema, migration, seed và truy vấn kiểm tra Postgres |
| `agent_training/` | Script sinh dữ liệu tổng hợp và train model gợi ý bữa ăn |
| `mindspace/` | Chatbot tâm sự (Python, Claude), service và database riêng. Xem [mindspace/README.md](mindspace/README.md) |

## Chạy local

```bash
npm install
cp .env.example .env      # điền giá trị thật, không commit file này
npm run api:server        # API ở http://127.0.0.1:8787
npm run dev               # frontend Vite
```

Mặc định `MAGERLIFE_DB_DRIVER=memory`, nên chạy được mà không cần database. Chạy cả stack với Postgres bằng Docker: xem mục 6 của [docs/deploy.md](docs/deploy.md).

## Kiểm tra

```bash
npm test               # test phân quyền server, chạy trên in-memory store, không gọi DB hay LLM thật
npm run build          # build frontend
npm run check:deploy   # kiểm tra cấu hình Vercel, schema, .env.example và tài liệu deploy
```

## Deploy

Push lên `main` của GitLab → GitLab CI kiểm tra, Vercel tự build và deploy (build dừng nếu `npm test` fail). Chi tiết, biến môi trường và các bước kiểm tra sau deploy: [docs/deploy.md](docs/deploy.md).

## Tài liệu khác

- `docs/backend-data-schema.md`, `docs/database/persistence-plan.md`: thiết kế dữ liệu ban đầu, viết khi frontend còn dùng `localStorage`.
- `docs/agent-api-roadmap.md`: hướng phát triển Agent/API.

Project cố ý giữ ít dependency: React, Vite, Tailwind, lucide-react và pg.
