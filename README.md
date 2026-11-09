# Tales Together

Collaborative, child-led storybook generator and EPUB 3 publisher. See `docs/` for the product design
and `docs/decisions.md` for the choices made so far.

```
frontend/   Expo app (web, iOS, Android) + Convex backend functions
design/     Cover art and shared design assets
docs/       Product, prompt, backend and EPUB design
```

## Stack

- **Client:** Expo SDK 58, Expo Router, React Native Web, TypeScript.
- **Backend:** Convex. Self-hosted via Docker for local development; hosted Convex for production.
- **v0 scope:** text + one static illustration + EPUB export. Ages 7–9, five chapters.
- **Access:** invite-only Clerk sign-in for family and friends; stories have no owner.

## Setup

Start the local Convex backend (Docker):

```bash
docker compose up -d
docker compose exec backend ./generate_admin_key.sh
```

Put the key, URL and Clerk publishable key in `frontend/.env.local` (see
`frontend/.env.example`), then:

```bash
cd frontend
npm install
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<instance>.clerk.accounts.dev
npx convex dev
```

Sign-in is invite-only (Clerk). Add yourself in the Clerk dashboard under Users;
in development, `you+clerk_test@example.com` signs in with the code `424242`.

In a second terminal:

```bash
cd frontend
npm run web        # http://localhost:8081
npm run ios        # simulator
npm run android    # emulator/device
```

## Checks

```bash
make check          # typecheck, Biome, jest, convex vitest
```

| Task | Command |
| --- | --- |
| Types | `npm run typecheck` |
| Lint/format | `npm run lint` / `npm run lint:fix` (Biome) |
| UI tests | `npm test` (jest-expo) |
| Backend tests | `npm run test:convex` (Vitest + convex-test) |
| Web build | `npx expo export --platform web` |

Convex functions live in `frontend/convex/`. Generated types in `frontend/convex/_generated/` are
committed; rerun `npx convex dev` after schema changes.
