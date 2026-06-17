# MagerLife staging deploy: Railway + Vercel + Supabase

This is the recommended staging setup now that Render is not being used.

## 1. Supabase Postgres

Create a Supabase project, then run SQL in this order:

1. `docs/database/schema.sql`
2. Optional demo data: `docs/database/seed-dev.sql`

If a previous failed schema run left partial tables and there is no real user data yet, run:

```sql
docs/database/reset-dev.sql
```

Then run schema + seed again.

Backend env:

```env
MAGERLIFE_DB_DRIVER=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

## 2. Railway backend

Create a Railway project from the GitHub repo.

Railway supports Dockerfile builds and can use a custom Dockerfile path via config as code. This repo includes `railway.json`, which points Railway to:

```text
Dockerfile.api
```

Railway docs note that Dockerfile config can be defined with `railway.json`, and custom Dockerfile paths are supported in config as code.

Set these Railway variables:

```env
MAGERLIFE_API_HOST=0.0.0.0
MAGERLIFE_DB_DRIVER=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true
MAGERLIFE_SESSION_SECRET=<long-random-secret>
MAGERLIFE_ADMIN_EMAILS=<your-admin-email>
MAGERLIFE_BILLING_WEBHOOK_SECRET=<long-random-secret>
MAGERLIFE_CORS_ORIGINS=https://<your-vercel-domain>
MAGERLIFE_LLM_PROVIDER=mock
MAGERLIFE_ENABLE_REAL_LLM=false
```

Do not set `MAGERLIFE_API_PORT` unless you need to override Railway. The server now uses Railway's `PORT` automatically.

When ready for real LLM:

```env
MAGERLIFE_LLM_PROVIDER=groq
MAGERLIFE_ENABLE_REAL_LLM=true
GROQ_API_KEY=...
```

Health URL:

```text
https://<railway-service>/health
```

## 3. Vercel frontend

Import the same GitHub repo into Vercel.

Set env:

```env
VITE_MAGERLIFE_API_BASE_URL=https://<railway-service>
```

Build:

```bash
npm run build
```

Output directory:

```text
dist
```

## 4. Admin account

Put your email in Railway:

```env
MAGERLIFE_ADMIN_EMAILS=you@example.com
```

Then register/login with that email in the deployed app. The server will bootstrap `admin/pro`.

## 5. Company test checklist

- Register new user
- Login again
- Finish onboarding
- Create/edit/delete finance jars
- Add income/expense
- Log food through chat
- Confirm pending nutrition estimate
- Open admin dashboard with admin email
- Check `/admin/analytics`
- Test mobile width
