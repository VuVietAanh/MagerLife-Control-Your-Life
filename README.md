# MagerLife

MagerLife is a personal life dashboard with an AI chat assistant. It is built for a single owner: sign-up is closed to everyone except the emails configured on the server.

## Features

- Dashboard: real-time clock and calendar (with lunar date), weather, daily planner, user state bar, calorie and meal tracking.
- Chat assistant: conversation, meal logging from free text, and profile updates.
- Jars: user-defined budget jars (by % or amount) and manual spending log, in VND or USD.
- Food library: the admin curates the shared library; personal foods are private.
- My Brain: review, confirm and delete what the assistant remembers.
- Account: profile data and AI provider settings (Mock, Ollama, Groq, OpenAI, xAI).

## Code layout

- `src/app/App.tsx`: app state, session restore and tab switching.
- `src/app/views/<tab>/`: one folder per tab (`dashboard`, `finance`, `food`, `account`, `brain`) plus `auth`.
- `src/app/layout/`: header, navigation tabs and the per-view error boundary.
- `src/app/ui/`, `lib/`, `hooks/`, `data/`: shared primitives, pure helpers (formatting, lunar calendar, meal text parsing), hooks and starter data.
- `src/app/services/`, `models/`: API client, domain logic and types.
- `src/server/`: the Node API used locally and by `api/[...path].js` on Vercel.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

The tests run against the in-memory store and never call a real database or LLM. Vercel runs them before every build.

This project intentionally keeps dependencies minimal: React, Vite, Tailwind, lucide-react, and pg.
