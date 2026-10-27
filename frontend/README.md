# Tales Together — Frontend

Expo (React Native + React Native Web) app with Convex backend functions.

```bash
npm install
npx convex dev     # needs the local Docker backend; see ../README.md
npm run web        # http://localhost:8081
```

- Routes: `src/app/` (Expo Router). Platform-specific files use `.web.tsx` / `.native.tsx`.
- Convex functions: `convex/`. Generated types are committed.
- Styling is React Native `StyleSheet` for now. NativeWind/Tailwind is not installed yet.
- Checks: `npm run check` (typecheck → Biome → jest → Vitest).
- One UI test: `npx jest src/path/to/file.test.tsx`
- One backend test: `npx vitest run convex/stories.test.ts`
