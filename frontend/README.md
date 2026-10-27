# Tales Together — Frontend

Next.js 16 (App Router) + React 19 + TypeScript 7 + Tailwind CSS 4.

```bash
npm install
npm run dev
```

Libraries: Zustand, TanStack Query, Framer Motion, clsx + tailwind-merge (`cn` in `src/lib/utils.ts`).

## Tooling

- **Type-check:** `npm run typecheck` (TypeScript 7).
- **Lint + format:** `npm run lint` (Biome). Fix with `npm run lint:fix`.
- **Tests:** `npm test` (Vitest + Testing Library, jsdom). Watch: `npm run test:watch`.
- **Everything:** `npm run check`.

TypeScript runs as a side-by-side install: `@typescript/native` provides the TS 7 `tsc`, while
`typescript` is aliased to the TS 6 API that tooling still needs. `npx tsc` uses TS 7.
