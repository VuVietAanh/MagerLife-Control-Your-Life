# MagerLife staging deploy: Render + Vercel + Supabase

This is the recommended staging setup for company testing.

## 1. Supabase Postgres

Create a Supabase project, then run:

1. `docs/database/schema.sql`
2. Optional for demo data: `docs/database/seed-dev.sql`

Copy the Postgres connection string for the backend.

Backend env:

```env
MAGERLIFE_DB_DRIVER=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

## 2. Render backend

Create a Render Web Service from this GitHub repo.

Use Docker:

```text
Dockerfile.api
```

Set env:

```env
MAGERLIFE_API_HOST=0.0.0.0
MAGERLIFE_API_PORT=8787
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

When ready for real LLM:

```env
MAGERLIFE_LLM_PROVIDER=groq
MAGERLIFE_ENABLE_REAL_LLM=true
GROQ_API_KEY=...
```

Health URL:

```text
https://<render-service>/health
```

## 3. Vercel frontend

Import the same GitHub repo into Vercel.

Set env:

```env
VITE_MAGERLIFE_API_BASE_URL=https://<render-service>
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

Put your email in:

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
