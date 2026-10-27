# Tales Together

Collaborative, child-led storybook generator and EPUB 3 publisher. See `docs/` for the full design.

```
frontend/   Next.js 16 + React 19 + TypeScript 7 + Tailwind CSS 4
backend/    Django 6 + DRF + Celery + PostgreSQL
design/     Cover art and shared design assets
docs/       Architecture and product documentation
```

## Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Zustand (client state), TanStack Query (server state), Framer Motion (animation), and
camelCase JSON via DRF are pre-wired.

## Backend

```bash
cd backend
cp .env.example .env # optional; SQLite + localhost defaults work out of the box
uv sync
uv run python manage.py migrate
uv run python manage.py runserver  # http://localhost:8000
uv run pytest
```

Celery worker (needs Redis):

```bash
uv run celery -A config worker -l info
```

API base path: `/api/`. Health check: `GET /api/health/`.

## Checks

```bash
make check          # frontend + backend
make check-frontend # typecheck, Biome, Vitest
make check-backend  # Ruff, mypy, pytest + coverage
```

| Tool | Frontend | Backend |
| ---- | -------- | ------- |
| Types | `npm run typecheck` (tsc 7) | `uv run mypy .` |
| Lint/format | `npm run lint` / `npm run lint:fix` (Biome) | `uv run ruff check .` / `ruff format .` |
| Tests | `npm test` / `npm run test:coverage` (Vitest) | `uv run pytest` / `uv run pytest --cov` |

