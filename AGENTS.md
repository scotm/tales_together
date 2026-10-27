# AGENTS.md

Tales Together: a collaborative, child-led storybook generator and EPUB 3 publisher.

## Read this first

`docs/` is a design blueprint, **not the current state of the code**. Vendor choices, verified API
gotchas and open questions live in `docs/decisions.md`; read it before adding infrastructure or
changing the stack. Component names, models and modules described in `docs/02`–`docs/05`
(`Epub3Compiler`, `useStoryDirectorStore.ts`, `Story`/`Chapter` models, `stories/tasks.py`, …) are
targets, not existing code. Check `frontend/` before building on them.

## Layout

- `frontend/` — Expo app. Routes in `src/app/` (Expo Router); Convex functions in `convex/`; shared
  code in `src/lib/`. Runs on web, iOS and Android via React Native Web.
- `frontend/convex/schema.ts` — the only source of truth for the data model. `stories`, `characters`,
  `chapters`.
- `design/cover_image/` — standalone SVG cover templates and `generate_cover_image.py`; not wired
  into the app, and its extras (lxml, resvg, TTF fonts) are not installed.
- `docs/` — product, prompt, backend and EPUB design, plus `decisions.md`.

The Django backend was deleted. Do not reintroduce Python services.

## Commands

Frontend (`cd frontend`, uses `npm`):

- `npx convex dev` — push functions and generate types. Needs the local Docker backend or a cloud
  deployment.
- `npm run web` / `ios` / `android` — Expo dev servers (web is port 8081).
- `npm run check` — typecheck → Biome → jest → convex Vitest.
- One UI test: `npx jest src/path/file.test.tsx`
- One backend test: `npx vitest run convex/stories.test.ts`
- Web build: `npx expo export --platform web` (writes `dist/`).
- `npx convex deploy` — hosted deployment.

Root: `make check` (same as `npm run check`).

## Gotchas

- The Convex CLI talks to the self-hosted backend via `CONVEX_SELF_HOSTED_URL` and
  `CONVEX_SELF_HOSTED_ADMIN_KEY` in `frontend/.env.local`. Without them it offers cloud login and
  fails in non-interactive terminals. On Docker 28+ with macOS, admin-key auth can fail over
  `127.0.0.1`; use `http://[::1]:3210`.
- Never prefix a secret with `EXPO_PUBLIC_`. Only the Convex URL belongs there.
- `frontend/convex/_generated/` is committed and required for typechecking. Rerun `npx convex dev`
  after changing `convex/schema.ts`.
- Two test runners on purpose: `jest-expo` for `.test.tsx` UI, Vitest + `convex-test` for
  `convex/**/*.test.ts` under the edge runtime. Don't merge them.
- Biome, not ESLint/Prettier: 80 columns, 2 spaces, double quotes. Run `npm run lint:fix`.
- Expo web replaces Next: no RSC, no `next/*` imports, no App Router. Routes are files under
  `src/app/`; use `expo-router` APIs.
- Share types, Convex client and business logic across platforms. Layout, focus/hover, gestures and
  file access diverge — split with `.web.tsx` / `.native.tsx` instead of platform checks everywhere.
- Styling is React Native `StyleSheet` today. NativeWind/Tailwind is **not installed**; don't add
  Tailwind classes or a `tailwind.config.*` until that decision is implemented.
- v0 has no accounts: the story id in the URL is the only access control. Keep it unguessable and
  don't add features that assume an owner.
- Convex actions are capped (10 min Node, 30 min Convex runtime, 512 MiB Node) and have no FFmpeg
  binary. Media work stays external.
- Generated/ignored, never hand-edit or commit: `frontend/node_modules/`, `frontend/.expo/`,
  `frontend/dist/`, `frontend/.env.local`, `frontend/*.tsbuildinfo`.
