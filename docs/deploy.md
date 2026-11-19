# Deploy MagerLife

Code nằm ở GitHub: `VuVietAanh/MagerLife-Control-Your-Life`. Repo GitLab cũ không còn dùng.

```text
nhánh feature/... ──PR──► dev ──PR──► main ──► Vercel production
        │                  │                     buildCommand: npm test && npm run build
        └── GitHub Actions (.github/workflows/ci.yml) chạy cho mọi PR vào dev/main:
              web:       npm ci, build, npm test, check:deploy, check cú pháp server
              mindspace: test Python (keyword filter, auth, PIN, pipeline offline)
```

## 0. Quy trình làm việc

1. Mỗi việc làm trên một nhánh riêng `feature/<tên-việc>` (hoặc `fix/...`) tách từ `dev`. Không commit thẳng vào `dev` hay `main`.
2. Push nhánh, mở Pull Request vào `dev`. CI chạy tự động.
3. Người review (không phải người viết code) duyệt PR. CI xanh và đã được duyệt thì merge vào `dev`.
4. Khi muốn phát hành: mở PR từ `dev` vào `main`. Merge vào `main` là Vercel deploy production.

Cài đặt một lần trên GitHub (repo → Settings → Branches → Add branch ruleset, cho cả `dev` và `main`):

- Require a pull request before merging, Required approvals: 1.
- Require status checks to pass: chọn `web (build, test, check:deploy)` và `mindspace (Python tests)`.
- Block force pushes, Restrict deletions.

Vercel: project MagerLife → Settings → Git → nối với repo GitHub trên, Production Branch = `main`. PR và nhánh `dev` có bản Preview riêng; biến môi trường cho Preview đặt riêng nếu muốn tách DB.

## 1. Database

Production dùng **Neon** (Postgres serverless). Chạy SQL bằng SQL Editor trên Neon Console. Các file trong `docs/database/`:

| File | Khi nào chạy |
| --- | --- |
| `schema.sql` | Khởi tạo database mới: tài khoản, profile, hũ, giao dịch, nhật ký ăn, food library |
| `nutrients-tables.sql` | Sau `schema.sql`, trước các file seed. Tạo bảng `nutrients`, `food_item_nutrients`, `meal_log_nutrients`, `probiotic_strains`, `food_item_probiotics` nếu chưa có, thêm cột còn thiếu, gộp luôn phần của v3/v4. Chạy lại an toàn |
| `migrate-nutrients-v3.sql`, `migrate-nutrients-v4.sql` | Bản cũ, đã gộp vào `nutrients-tables.sql`; không cần chạy riêng |
| `seed-nutrients.sql` | Sinh tự động bởi `node scripts/generate-nutrient-artifacts.mjs`; chạy lại an toàn |
| `seed-probiotics.sql` | Sau v4 |

Không chạy `seed-dev.sql` hay `reset-dev.sql` trên production: chúng dành cho môi trường dev và `reset-dev.sql` xóa dữ liệu.

`docs/database/inspect.sql` chứa các câu truy vấn chỉ đọc để kiểm tra dữ liệu.

File export database (`*.csv` ở thư mục gốc) chứa dữ liệu thật và đã bị `.gitignore` chặn. Đừng để chúng nằm lâu trong thư mục repo.

## 2. Vercel

Project Vercel nối với repo GitHub (Production Branch = `main`). Cấu hình build nằm trong `vercel.json`, không cần chỉnh trên giao diện:

| Mục | Giá trị |
| --- | --- |
| Framework | `vite` |
| Build Command | `npm test && npm run build` |
| Output Directory | `dist` |
| Route | `/api/*` → `api/[...path].js`, còn lại → file tĩnh, fallback `index.html` |

Mỗi lần push lên `main` Vercel tự deploy production. Nếu cần ép deploy lại mà không đổi code: `git commit --allow-empty -m "Trigger Vercel deploy"` rồi push.

### MindSpace (tab "Tâm sự") chạy chung project

`api/mindspace.py` là một Vercel Function Python, chạy FastAPI trong `mindspace/app.py`. `vercel.json` chuyển `/mindspace/*` về function này, nên frontend gọi cùng domain, không cần CORS hay project Vercel riêng. Thư viện Python lấy từ `requirements.txt` ở thư mục gốc (bản gọn, không có RAG). `functions.excludeFiles` loại `node_modules`, `dist` và các thư mục không cần khỏi gói Python.

Kiểm tra sau deploy: `GET /mindspace/health` phải trả `{"status":"ok"}`.

## 3. Biến môi trường trên Vercel

Đặt trong Vercel → Project Settings → Environment Variables. Giá trị thật chỉ nằm ở đây, không bao giờ nằm trong repo.

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `VITE_MAGERLIFE_API_BASE_URL` | Có | `/api` (frontend gọi cùng domain) |
| `MAGERLIFE_DB_DRIVER` | Có | `postgres` |
| `DATABASE_URL` | Có | Connection string của Neon (Neon Console → Connect) |
| `DATABASE_SSL` | Có | `true` |
| `MAGERLIFE_SESSION_SECRET` | Có | Chuỗi ngẫu nhiên dài; đổi giá trị sẽ đăng xuất mọi phiên |
| `MAGERLIFE_ADMIN_EMAILS` | Có | Email được làm admin, phân cách bằng dấu phẩy |
| `MINDSPACE_SHARED_SECRET` | Khi dùng Tâm sự | ≥ 32 ký tự, khác `MAGERLIFE_SESSION_SECRET`. API Node dùng để ký token, function MindSpace dùng để kiểm tra; cùng một project nên chỉ đặt một lần. Xem `mindspace/README.md` mục Đăng nhập |
| `MINDSPACE_DATABASE_URL` | Khi dùng Tâm sự | Connection string của **project Neon riêng** cho MindSpace (hội thoại tâm sự không nằm chung DB với MagerLife). Bảng tự tạo ở lần chạy đầu |
| `ANTHROPIC_API_KEY` | Khi dùng Tâm sự | Key Claude cho MindSpace |
| `MAGERLIFE_ALLOWED_EMAILS` | Không | Email khác được phép đăng ký (sign-up đóng với mọi người còn lại) |
| `MAGERLIFE_CORS_ORIGINS` | Không | Domain Vercel nếu frontend và API khác origin |
| `MAGERLIFE_RATE_LIMIT_PER_MIN` | Không | Mặc định 180 request/phút/IP |
| `MAGERLIFE_LLM_PROVIDER` | Không | `groq`, `xai`, `openai` hoặc `mock` |
| `MAGERLIFE_ENABLE_REAL_LLM` | Không | `true` để gọi LLM thật |
| `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | Theo provider | Tương tự cho `XAI_*`, `OPENAI_*` |

Bộ tối thiểu:

```env
VITE_MAGERLIFE_API_BASE_URL=/api
MAGERLIFE_DB_DRIVER=postgres
DATABASE_URL=postgres://...
DATABASE_SSL=true
MAGERLIFE_SESSION_SECRET=<chuỗi ngẫu nhiên dài>
MAGERLIFE_ADMIN_EMAILS=<email của bạn>
```

Danh sách đầy đủ kèm giá trị mẫu: `.env.example`.

Người dùng có thể tự nhập provider và API key riêng trong Account → Trợ lý AI; Ollama luôn chạy phía client vì server trên cloud không gọi được máy của người dùng.

## 4. Tài khoản admin

Không có endpoint tạo admin. Đăng ký bình thường trong app bằng một email nằm trong `MAGERLIFE_ADMIN_EMAILS`; server gán role admin khi đăng ký hoặc đăng nhập.

## 5. Kiểm tra sau deploy

```bash
npm run smoke:production
```

Script gọi API production, tạo một tài khoản `smoke-<timestamp>@example.com` với mật khẩu ngẫu nhiên và chạy các luồng chính. Đổi domain bằng:

```bash
MAGERLIFE_SMOKE_API_BASE_URL=https://<domain>/api npm run smoke:production
```

> **Đang hỏng trên production:** sign-up đã đóng và `MAGERLIFE_ALLOWED_EMAILS` so khớp chính xác từng email, nên email smoke đổi theo mỗi lần chạy luôn bị từ chối ở bước đăng ký. Cần sửa script (ví dụ đăng nhập bằng một tài khoản smoke cố định lấy từ biến môi trường) trước khi dùng lại.

Kiểm tra tay:

- `https://<domain>/api/health` và `https://<domain>/api/health/db` trả OK.
- Đăng nhập, mở từng tab (Dashboard, Finance, Food, My Brain, Account).
- Ghi một món ăn qua chat, tạo/sửa/xóa một hũ tài chính.
- Kiểm tra giao diện mobile.

## 6. Chạy toàn bộ stack bằng Docker (local)

Dùng khi muốn thử với Postgres thật trên máy, không cần Vercel.

```bash
cp .env.docker.example .env.docker
docker compose up --build
```

| Service | Địa chỉ | Ghi chú |
| --- | --- | --- |
| `web` | http://localhost:8080 | nginx phục vụ bản build Vite |
| `api` | http://localhost:8787/health | Node API |
| `db` | localhost:5432 | Postgres 16, tự chạy `schema.sql` và `seed-dev.sql` ở lần khởi tạo đầu |

Admin mặc định trong `.env.docker.example` là `admin@magerlife.local`. Mặc định LLM ở chế độ `mock`; muốn dùng Groq thì sửa `.env.docker` (không sửa file `.example`):

```env
MAGERLIFE_LLM_PROVIDER=groq
MAGERLIFE_ENABLE_REAL_LLM=true
GROQ_API_KEY=<key>
```

`VITE_MAGERLIFE_API_BASE_URL` được gắn vào bản build web lúc `docker compose build` qua build arg trong `docker-compose.yml`; đổi build arg đó nếu API chạy ở host khác.
