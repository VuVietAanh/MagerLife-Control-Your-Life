# MagerLife temporary GitHub + Docker deploy

This guide is for an internal/company test build. It runs:

- `web`: Vite React build served by nginx at `http://localhost:8080`
- `api`: Node API at `http://localhost:8787`
- `db`: local Postgres with `docs/database/schema.sql` and `docs/database/seed-dev.sql`

## 1. Before pushing to GitHub

Make sure secrets are not committed:

- `.env`
- `.env.*`
- `node_modules`
- `dist`

The repo already ignores those files.

## 2. Run locally with Docker

```bash
docker compose up --build
```

Open:

```text
http://localhost:8080
```

API health:

```text
http://localhost:8787/health
```

Default docker admin bootstrap email:

```text
admin@magerlife.local
```

Register/login with that email in the app to receive `admin/pro` from the server.

## 3. Enable real Groq in Docker

Edit `.env.docker.example` before sharing a private test build:

```env
MAGERLIFE_LLM_PROVIDER=groq
MAGERLIFE_ENABLE_REAL_LLM=true
GROQ_API_KEY=your-key
```

Do not commit real keys.

## 4. GitHub push

If this folder is not already its own Git repository, initialize it from the `MagerLife` folder:

```bash
git init
git add .
git commit -m "Prepare Docker test deploy"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

If the parent folder is already the Git repository, add only this project folder intentionally.

## 5. Company test notes

For quick testing, use the default local Postgres from compose.

For shared/staging testing, replace `DATABASE_URL` with Supabase Postgres and set:

```env
MAGERLIFE_DB_DRIVER=postgres
DATABASE_SSL=true
DATABASE_URL=postgresql://...
```

The frontend API base URL is baked during the Docker web build through:

```yaml
VITE_MAGERLIFE_API_BASE_URL: http://localhost:8787
```

Change that build arg when the API is deployed to Render or another host.
