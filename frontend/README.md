# Tales Together — Frontend

Expo (React Native + React Native Web) app with Convex backend functions.

```bash
npm install
npx convex dev     # needs the local Docker backend; see ../README.md
npm run web        # http://localhost:8081
```

To test in Safari on an iPad on the same LAN:

```bash
npm run web:lan
```

This detects the Mac's LAN IPv4 address, starts Docker with matching Convex public
origins, and starts Expo on all interfaces. Open the printed `http://<Mac-IP>:8081`
address on the iPad. Both image/book URLs and API connections use the Mac's address;
the ignored `.env.local` file is left untouched. Keep Docker and this command running.
If multiple adapters are active, choose one with `LAN_HOST=192.168.x.x npm run web:lan`.

If Recent stories cannot load, after ten seconds it shows the backend address and
a reconnect button. Reconnecting preserves the form; queued writes are allowed
to finish first. For a device connection problem, open `http://<Mac-IP>:3210/version`
on the device: a response of `unknown` is normal for this self-hosted build.
If that works but the app still cannot connect, check the displayed server address
and the browser console's connection timeout warning. Web development also maps a
configured loopback backend host to the browser's host. Reload Safari after switching
between local and LAN testing to replace any cached development bundle.

- Routes: `src/app/` (Expo Router). Platform-specific files use `.web.tsx` / `.native.tsx`.
- Convex functions: `convex/`. Generated types are committed.
- Styling is React Native `StyleSheet` for now. NativeWind/Tailwind is not installed yet.
- Checks: `npm run check` (typecheck → Biome → jest → Vitest).
- One UI test: `npx jest src/path/to/file.test.tsx`
- One backend test: `npx vitest run convex/stories.test.ts`

## Image cost controls

Image generation defaults to direct Gemini on a fresh deployment. The local dev
deployment uses Surplus with `gemini-2.5-flash-image`, tested on 2026-11-07.
Text generation is configured separately.

Set server-side Convex environment variables (never `EXPO_PUBLIC_`):

```bash
npx convex env set SURPLUS_API_KEY
npx convex env set SURPLUS_IMAGE_MODEL gemini-2.5-flash-image
npx convex env set SURPLUS_MIN_DISCOUNT_PCT 50
npx convex env set IMAGE_PROVIDER surplus
```

The first command reads the secret interactively or through stdin. The discount
floor is an estimate against Surplus's reference price, not a fixed USD cap or a
guarantee against Google's bill. Provider failures do not fall back to a second
paid vendor. Existing artwork is reused.

Use `IMAGE_PROVIDER=gemini` to return to direct Google image generation, or
`IMAGE_PROVIDER=disabled` to stop new image spending while keeping text and EPUB
export working. These controls do not delete existing images.

`imageSamples:generate` is an internal CLI-only action for isolated model tests;
it returns a stored JPEG, timing, request id and reported charge when available.
Check charges against `/v1/requests/{requestId}`. See `../docs/decisions.md` for
measured prices, rejected routes and quality limitations.
