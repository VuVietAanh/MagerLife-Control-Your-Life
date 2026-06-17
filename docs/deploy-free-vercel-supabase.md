# MagerLife free staging deploy: Vercel + Supabase

This path is for a low-cost company test build:

- Frontend: Vercel Hobby
- Backend API: Vercel Serverless Functions under `/api/*`
- Database: Supabase Postgres Free
- Local company testing: Docker Compose

## 1. Supabase database

Create a Supabase project, open SQL Editor, then run:

1. `docs/database/schema.sql`
2. optional demo data: `docs/database/seed-dev.sql`

If an earlier SQL run failed halfway and there is no real data yet, run `docs/database/reset-dev.sql` first, then run the schema again.

Copy the Supabase Postgres connection string for `DATABASE_URL`.

## 2. Vercel project

Import the GitHub repository into Vercel.

Use these settings:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

The API is deployed from `api/[...path].js`. The frontend should call the same Vercel domain with:

```env
VITE_MAGERLIFE_API_BASE_URL=/api
```

## 3. Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

```env
VITE_MAGERLIFE_API_BASE_URL=/api
MAGERLIFE_DB_DRIVER=postgres
DATABASE_URL=postgres://...
DATABASE_SSL=true
MAGERLIFE_SESSION_SECRET=replace-with-long-random-secret
MAGERLIFE_ADMIN_EMAILS=your-admin-email@example.com
MAGERLIFE_BILLING_WEBHOOK_SECRET=replace-with-your-webhook-secret
MAGERLIFE_CORS_ORIGINS=https://your-vercel-domain.vercel.app
MAGERLIFE_LLM_PROVIDER=mock
MAGERLIFE_ENABLE_REAL_LLM=false
```

Only add `GROQ_API_KEY` later when you want real LLM calls in staging. Keep it server-side in Vercel env only.

## 4. First admin account

Use an email listed in `MAGERLIFE_ADMIN_EMAILS`, then register normally in the app. The backend will assign admin role on registration/login.

## 5. Smoke test

After Vercel deploys, test:

- `https://your-vercel-domain.vercel.app/api/health`
- register new account
- login again
- complete onboarding
- create/edit/delete finance jars
- log nutrition from chat/manual flow
- open Admin tab with the admin email
- check mobile layout

## Notes

This free staging path is good for internal testing. It is not the final production shape if traffic grows or background jobs/payment webhooks become heavy.
