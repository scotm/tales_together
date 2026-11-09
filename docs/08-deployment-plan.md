# 08 — Deployment plan (draft)

Status: **draft.** The code changes are implemented (2026-11-09): invite-only
sign-in enforced in Convex, the 10-books-a-day cap, the per-device "Recent
stories" shelf and `frontend/vercel.json`. See `decisions.md`. The Clerk
development instance is configured. Nothing is deployed yet: no Convex Cloud
project, Vercel project, Clerk production instance or DNS records exist.
Researched 2026-11-08 against the current repository and vendor documentation. Prices and plan limits are a
snapshot; re-check them before paying for anything.

Goal: let family and friends outside the home network open Tales Together and
make a book, without leaving the Mac running, and without an open path to an
unbounded AI bill.

Decided so far (2026-11-08):

- **Audience:** family and friends. Non-commercial, so Vercel Hobby is allowed.
- **Spend:** at most **10 new books per UTC day** across the whole deployment.
  The Gemini and Surplus keys are prepaid, so the worst case is losing the
  remaining balance (about US$20–30), not an open-ended bill.
- **Access:** gate the app behind sign-in for invited people only, using Clerk
  in invite-only mode. See [Access gate](#access-gate).
- **Domain:** `talestogether.xyz` (purchased 2026-11-08). The app is served at
  `https://talestogether.xyz`, and Clerk uses its subdomains. See
  [Domain and DNS](#domain-and-dns).

## TL;DR

- **Recommended:** web app on **Vercel** (static Expo export) + backend on
  **Convex Cloud** (hosted production deployment). One build command deploys
  both on every push to `main`. This matches the existing decision in
  `decisions.md` ("Platform + v0 scope": hosted Convex for production).
- Both have free tiers that comfortably fit a small group of testers. Vercel
  Hobby is personal and non-commercial only. Expect real money to go to Gemini
  (and Surplus), not to hosting.
- **Before sharing the link** (done in code, 2026-11-09): invited sign-in is
  required in every public Convex function, new books are capped at 10 a day,
  and the "Recent stories" leak is fixed. See
  [Blockers before sharing](#blockers-before-sharing).
- **Clerk needs a domain you own** for its production instance, so the app
  lives at `talestogether.xyz` rather than `*.vercel.app`.
- Native apps (TestFlight / Android internal testing) are a separate, later
  step. iPad Safari against the hosted web app is the fastest way to share, and
  HTTPS also fixes browser microphone capture, which plain-HTTP LAN testing cannot provide.

## What has to be deployed

| Piece | Today (local) | Hosted |
| :--- | :--- | :--- |
| Web client | `expo start --web` on :8081 | `npx expo export -p web` → static `dist/` (SPA, `web.output: "single"`) |
| Backend | Self-hosted Convex in Docker (:3210/:3211) | Convex Cloud production deployment |
| Functions, schema, crons | `npx convex dev` | `npx convex deploy` |
| Server secrets | `npx convex env set …` on the Docker backend | Same commands against the cloud deployment |
| Catalogue seed data | `npm run catalog:seed` | Run `migrations:seedCatalog` once on production |
| Native apps | Expo Go / dev builds | EAS Build + TestFlight / Play internal testing (later) |

Facts about the app that shape the choice:

- The web export is a pure single-page app. No API routes and no server
  rendering, so any static host works. All server logic is Convex.
- The client needs exactly one build-time value, `EXPO_PUBLIC_CONVEX_URL`
  (`src/lib/convex.ts`). Expo inlines `EXPO_PUBLIC_*` at build time, so the URL
  is baked into the bundle. Changing backends means rebuilding.
- Optional build labels `EXPO_PUBLIC_BUILD_ID` and `EXPO_PUBLIC_ENVIRONMENT`
  feed the diagnostics screen. They are not secrets.
- Images, covers and EPUBs are served straight from Convex file storage via
  `ctx.storage.getUrl`, so the static host never sees them.
- Node actions (`mediaNode.ts`, `cover/rasterize.ts`, `speech*`,
  `llm/compressImage.ts`) are within Convex Cloud's limits: 512 MiB, 10 minutes,
  5 MiB arguments. No binaries are needed (resvg is WASM, JPEG is `jpeg-js`).
- Two crons (`crons.ts`) run on whichever deployment the code is pushed to:
  daily diagnostics cleanup and hourly hero-idea expiry.
- `src/lib/convexUrl.web.ts` only rewrites loopback hosts when `__DEV__` is
  set, so production builds use the configured URL unchanged.

## Options considered

### A. Vercel + Convex Cloud — recommended

Vercel serves `dist/`; Convex Cloud runs the backend. Convex's documented
Vercel integration makes the Vercel build run `npx convex deploy`. That
command pushes functions to production, then runs the web export with the
production URL injected.

Pros:

- One push deploys backend and frontend together, so they cannot drift.
- Optional per-PR previews: Vercel preview + a fresh Convex preview backend
  per branch.
- HTTPS everywhere, so browser microphone capture works on iPad (see
  `workshop-ideas-runbook.md`).
- Hosted Convex runs backend upgrades, backups and scaling for us. The
  self-hosted Docker image is `:latest` and unpinned locally.
- No new code languages or services; matches `decisions.md`.

Cons:

- Two vendor accounts (or one, via the Vercel Marketplace Convex integration,
  which bills Convex through Vercel and creates a separate Convex team).
- Vercel Hobby is "personal, non-commercial use" only. A commercial launch needs
  Pro ($20/month per developer seat).
- Vercel Deployment Protection gates the **web page only**. The Convex URL is
  in the public JS bundle and its public functions are callable directly, so
  protection is not a spend or privacy boundary.

### B. Expo Hosting (EAS) + Convex Cloud

`eas deploy` uploads the same `dist/` to `https://<name>.expo.app`. Free plan
available; custom domains need a paid Expo plan. Expo recommends this host for
Expo Router web apps.

Pros: same vendor as the future native builds (EAS Build/Submit/Update); one
Expo account for everything.

Cons: no first-party Convex integration, so CI (e.g. a GitHub Actions job) has
to run `npx convex deploy --cmd 'npx expo export -p web'` and then
`eas deploy --prod`. Per-branch Convex previews have to be wired by hand.

A reasonable choice if native distribution becomes the priority. Hosting is
interchangeable later because the output is a static folder.

### C. Netlify, Cloudflare Pages, Firebase Hosting + Convex Cloud

Functionally equivalent to A for a static SPA. Convex documents Netlify the
same way as Vercel. Choose one only for a non-technical reason (existing
account, or commercial use without paying for Vercel Pro; check that host's
free-plan terms first).

### D. Self-host Convex on a VPS + any static host

Run the existing `docker-compose.yml` on a VPS (DigitalOcean/Hetzner/Fly) behind
a TLS proxy (Caddy), with `CONVEX_CLOUD_ORIGIN`/`CONVEX_SITE_ORIGIN` set to public
HTTPS URLs. Deploy with `CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY`
instead of a deploy key.

Pros: identical to local; fixed monthly price; data location under our control.

Cons: we own TLS, backups, image pinning, backend-version migrations, uptime and
the admin key. No preview deployments. Convex's own guidance is that the cloud
product is safer for anything that needs to stay up. `decisions.md` already
lists this as a fallback, not the plan.

### E. Tunnel from the Mac (Cloudflare Tunnel, Tailscale Funnel, ngrok)

Quickest possible demo: expose the Expo server and Convex :3210/:3211 over
HTTPS tunnels. Only works while the Mac is awake and Docker is running.
`CONVEX_CLOUD_ORIGIN`/`CONVEX_SITE_ORIGIN` have to match the tunnel hostnames,
the same trap documented for `web:lan`.
Serving the dev bundle remotely is slow; serve `expo export` output instead.

Use for a one-evening demo with a known person, not for "share this with others".

### Comparison

| | A. Vercel + Convex | B. EAS + Convex | D. VPS self-host | E. Tunnel |
| :--- | :--- | :--- | :--- | :--- |
| Hosting cost for a small group | $0 (Hobby + Convex Free) | $0 (Expo Free + Convex Free) | ~$6–12/month VPS | $0 |
| Ops burden | Low | Low–medium (CI glue) | High | Low, but Mac must be on |
| Deploy on push | Built in | GitHub Actions | GitHub Actions | No |
| Per-PR preview backends | Built in | Manual | No | No |
| HTTPS (mic capture) | Yes | Yes | Yes, via proxy | Yes |
| Commercial use on free tier | No (Hobby) | Check Expo terms | Yes | n/a |

## Free-tier fit (snapshot 2026-11-08)

**Convex Free** (Starter is the same with pay-as-you-go overage): 1M function
calls/month, 20 GB-hours action compute, 0.5 GB database, 1 GB file storage,
1 GB/month egress, 1,000 concurrent sessions, 16 concurrent queries,
64 concurrent Node actions. When Free limits are hit, writes may fail. Starter
keeps working and bills overage.

Rough sizing for one book, from `decisions.md`: about 6 compressed images at
roughly 220–270 KB each, plus an EPUB under 2 MB, so about 3–4 MB stored and a
similar amount of egress per download. 1 GB of storage holds about 250 books.
Egress is the first limit likely to bite: every image view and EPUB download
counts. Move to Starter (pay-as-you-go) before sharing widely, so a busy week
causes a small bill rather than failed writes.

**Vercel Hobby:** 100 GB data transfer, 1M CDN requests, 100 deployments/day,
1 hour of runtime logs. The site is static, so function limits don't apply.
Exceeding Hobby limits pauses the feature for up to 30 days. Personal,
non-commercial use only.

**AI providers are the real cost.** Neither host caps Gemini or Surplus spend.
See below.

## Blockers before sharing

These are not hosting problems, but publishing a URL turns them into live
risks. Items 1–3 are fixed in code as of 2026-11-09; item 4 remains.

1. **Anyone can call the backend.** *(Fixed.)* The Convex URL ships in the
   public JS bundle, and none of the 16 public functions checked who was
   calling. Every public function except `diagnostics.ping` now requires an
   invited, signed-in user. See [Access gate](#access-gate). This is the main protection; the
   other items limit the damage if a friend's account is misused.
2. **No cap on new books.** *(Fixed.)* `heroIdeaQuota` caps idea preparation and
   transcription at 600 request units per UTC day per deployment. `stories`,
   `chapters`, `media` and `exportJobs` have no equivalent, and
   `BOOK_BUDGET_USD`/`BOOK_IMAGE_CAP` in `lib/config.ts` are unused (see the
   note in `chapters.ts`).
   Now `stories.createFromSetup` reserves one slot in a deployment-wide
   counter of **10 books per UTC day** (`bookQuota`, one row per day,
   incremented inside the creating mutation). Over the cap, it refuses with
   "The story library is full for today. Please try again tomorrow." Change the
   number with `npx convex env set DAILY_BOOK_LIMIT <n>`; no deploy needed.
   Residual risk: `writeChapter` retries and cover/illustration regeneration on
   existing books are not counted. With sign-in in place and prepaid keys capping
   the loss at the remaining balance, that is acceptable for now.
3. **"Recent stories" leaked every book.** *(Fixed.)* The story id in the URL
   is the only per-story access control, which `decisions.md` accepts for v0.
   But `stories:listRecent` was a public query that returned the ten newest
   full `stories` documents to anyone, including their ids, so every visitor
   could open every other family's book. Sign-in alone would only narrow this
   to invited people; one family would still see another's children's books. It is now a device-scoped list: each
   device keeps the ids it created or opened, and `stories:listByIds` returns
   only those (title and chapter count). Scoping by
   signed-in user instead would make stories owned, which reverses the v0
   "no owner" rule in `AGENTS.md`/`decisions.md`. Treat that as a separate,
   deliberate decision.
4. **Children's content on a hosted service.** Prose, typed author names and
   reviewed custom ideas are stored in Convex (US region by default; region is
   selectable when the deployment is created). Before inviting anyone outside
   the family, add a short notice of what is stored, and decide the retention or
   delete path. `diagnostics:purge` covers diagnostics only, not stories.
   Moderation is enforced, but `decisions.md` notes that family-safety
   evaluation is still outstanding.

Vercel Deployment Protection is not a substitute for any of these: it hides
the page, but the backend stays callable (see the cons under option A).

## Access gate

The gate must be enforced **in Convex**, because that is where the spend and
the stories are. A login screen in the app alone protects nothing. The plan is
"signed in and invited", not "owns this story". Story ids keep working as
links between invited people, and the v0 no-owner model stays intact.

### Options

| | Clerk (invite-only) | Convex Auth | Shared invite code |
| :--- | :--- | :--- | :--- |
| What guests do | Accept an emailed invite, then sign in with email code or Google/Apple | Sign in with email code, password or OAuth | Type a code once per device |
| Who can get in | Only people you invite from the Clerk dashboard | Whoever you let sign up; the allowlist is your own code | Anyone who learns the code |
| Revoke one person | Yes (dashboard) | Yes (delete user) | No; rotate the code for everyone |
| Expo web + iOS + Android | Yes: `@clerk/expo` (web via `@clerk/expo/web`) + `ConvexProviderWithClerk` | Yes (React, React Native) | Yes |
| Cost | Free (Hobby plan, 50,000 retained users) | Free | Free |
| Needs your own domain | **Yes**, for the production instance (DNS records) | No, unless emailing codes: email providers like Resend need a verified domain to send to arbitrary addresses | No |
| Maturity | Commercial product, documented Convex integration | Beta | Trivial, home-made |
| Work in this repo | Medium: providers, sign-in screen, `auth.config.ts`, gate in 16 functions | Medium–high: auth tables in schema, HTTP routes, own UI | Low: one table/env var, gate in 16 functions |

### Chosen: Clerk, invite-only (implemented 2026-11-09)

It matches the family-and-friends shape best. You add specific email
addresses, and nobody else can create an account. One person can be removed
without affecting the others. Notes:

- Use **Invite-only** access mode, which isn't marked as a paid feature on
  Clerk's pricing page. The **allowlist** and **blocklist** are paid in
  production, and invite-only makes them unnecessary.
- **A domain you own is required.** Clerk production instances need DNS
  records on your domain. Point the same domain at Vercel (custom domains are
  allowed on Hobby). Clerk development instances work on `*.vercel.app`, but
  Clerk does not support them for production use. The domain is the one real
  new cost (about US$10–15 a year).
- **Sign-in is email code only.** Password, username and social providers
  are off (set with `clerk config patch` on the development instance).
  Social sign-in in production would need your own OAuth credentials per
  provider; email codes need none.
- **Adding a guest:** Clerk dashboard → Users → **Create user**, with the email
  only. They can sign in straight away. This avoids Clerk's invitation
  acceptance flow, which would need extra handling in the app. To remove
  someone, delete or ban the user.
- **Convex side:** `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN`,
  which must be set on every Convex deployment; deploys fail without it. The
  Convex integration is active in Clerk, so session tokens carry
  `aud: "convex"` (verified).
- **Client side:** `ClerkProvider` + `ConvexProviderWithClerk` live in
  `src/lib/BackendProvider.tsx`. `RequireSignIn` wraps the workshop and story
  screens, so a shared `/story/<id>` link keeps its URL through sign-in. The
  client needs `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time (public by
  design: `pk_test_…` locally, `pk_live_…` in production). Clerk's secret key
  is not needed.
- **Server side:** every public function starts with
  `await requireMember(ctx)` (`convex/lib/access.ts`). A source scan in
  `convex/access.test.ts` fails if a new public function lacks it.
  `diagnostics.ping` is deliberately public, because it returns only a
  timestamp and the connection check runs before sign-in.
- **Testing locally:** Clerk development instances accept any
  `name+clerk_test@example.com` user with the code `424242`, and send no email.
  Create such a user in the dashboard to try the flow.

## Setup (option A)

### 1. Convex Cloud

1. Create a Convex account and project (dashboard, or `npx convex login` from a
   clean shell). Choose the data region when the production deployment is
   created.
2. Generate a **production deploy key** (Deployment Settings → General). Scope
   it to deploy.
3. Set production environment variables in the dashboard (Deployment Settings
   → Environment Variables), or with the CLI against the production deployment:

   | Variable | Value | Notes |
   | :--- | :--- | :--- |
   | `GEMINI_API_KEY` | secret | Required: text, speech, moderation; images when `IMAGE_PROVIDER=gemini` |
   | `IMAGE_PROVIDER` | `surplus`, `gemini` or `disabled` | Unset means direct Gemini. `disabled` still exports readable books |
   | `SURPLUS_API_KEY` | secret | Only with `surplus` |
   | `SURPLUS_IMAGE_MODEL` | `gemini-2.5-flash-image` | Optional |
   | `SURPLUS_MIN_DISCOUNT_PCT` | `50` | Optional; must not be empty if set |
   | `GEMINI_PROSE_MODEL` / `GEMINI_FAST_MODEL` / `GEMINI_IMAGE_MODEL` / `SPEECH_GEMINI_MODEL` | pinned ids | Optional; defaults in `lib/config.ts` |
   | `DIAGNOSTIC_MAX_STORED_*` | numbers | Optional; defaults are fine |
   | `CLERK_JWT_ISSUER_DOMAIN` | `https://clerk.talestogether.xyz` | Required. Clerk production Frontend API URL, read by `auth.config.ts`. Copy the exact value from Clerk's API keys page |
   | `DAILY_BOOK_LIMIT` | `10` | Optional; new books per UTC day across the deployment (default 10) |

   **Never set `LOCAL_LLM_URL` on production.** It moves every text call to the
   local model. Set the same keys as project defaults for preview
   deployments if those are enabled, preferably with separate,
   low-limit API keys.
4. Consider declaring these variables in `convex/convex.config.ts`
   (`defineApp({ env: … })`). Convex then validates them at deploy time instead
   of failing on the first story. This is a small follow-up code change, not a
   prerequisite.

### 2. Vercel project

1. Import `github.com/scotm/tales_together` at <https://vercel.com/new>. Set
   **Root Directory** to `frontend` and **Framework Preset** to "Other".
2. `frontend/vercel.json` is in the repo:

   ```json
   {
     "framework": null,
     "installCommand": "npm ci",
     "buildCommand": "npx convex deploy --cmd-url-env-var-name EXPO_PUBLIC_CONVEX_URL --cmd 'npx expo export --platform web'",
     "outputDirectory": "dist",
     "cleanUrls": true,
     "rewrites": [{ "source": "/:path*", "destination": "/" }]
   }
   ```

   - The rewrite is required for the SPA. Deep links such as `/story/<id>`
     must serve `index.html`. Vercel serves real files (`/_expo/static/…`,
     assets) before applying rewrites.
   - `--cmd-url-env-var-name` makes the URL variable explicit instead of relying
     on CLI framework detection.
3. Vercel environment variables:
   - `CONVEX_DEPLOY_KEY` = production deploy key, **Production only**.
   - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_…` (Production). It is
     public by design, so the prefix is fine.
   - `EXPO_PUBLIC_ENVIRONMENT` = `production` (Production) / `preview` (Preview).
   - Optional build id: prefix the build command with
     `EXPO_PUBLIC_BUILD_ID=$VERCEL_GIT_COMMIT_SHA`.
   - No other secrets belong in Vercel. AI keys live only in Convex.
4. Push to `main`. Vercel installs, `convex deploy` pushes functions/schema/crons,
   and the export bakes in the production URL. Vercel then publishes
   `https://<project>.vercel.app`.
5. Add `talestogether.xyz` and `www.talestogether.xyz` to the Vercel project
   (redirect `www` to the apex), then add the records described in
   [Domain and DNS](#domain-and-dns). Share only `https://talestogether.xyz`.

### Domain and DNS

`talestogether.xyz` serves two things: the app (Vercel) and Clerk's sign-in
infrastructure (subdomains). Nothing points at Convex; the client talks to
`*.convex.cloud` directly.

| Host | Type | Points to | Set up from |
| :--- | :--- | :--- | :--- |
| `talestogether.xyz` (apex) | A | Vercel's IP as shown in the project's Domains page | Vercel |
| `www` | CNAME | Vercel's target as shown in the Domains page | Vercel |
| `clerk` | CNAME | `frontend-api.clerk.services` (confirm in Clerk) | Clerk → Domains |
| `accounts` | CNAME | Clerk Account Portal target | Clerk → Domains |
| `clkmail`, `clk._domainkey`, `clk2._domainkey` | CNAME | Clerk email (sending + DKIM) targets | Clerk → Domains |

Copy every value from the two dashboards rather than from this table. The
Clerk targets above are the usual shape, but the dashboard is authoritative.

DNS is at **Namecheap** (registrar and BasicDNS nameservers
`dns1/dns2.registrar-servers.com`, checked 2026-11-08; no CAA record). In
Namecheap → Domain List → Manage → **Advanced DNS**:

- Delete the default parking records first: the `www` CNAME to
  `parkingpage.namecheap.com` and the `@` URL Redirect record. They conflict
  with Vercel's records.
- Enter hosts without the domain: `@` for the apex, `www`, `clerk`,
  `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`. Namecheap appends
  `talestogether.xyz` itself, so entering `clerk.talestogether.xyz` would
  create `clerk.talestogether.xyz.talestogether.xyz`.
- Leave TTL on Automatic.
- Alternative: switch the nameservers to Vercel and manage the Vercel records
  there. That isn't needed. Keeping Namecheap DNS keeps all records in one
  place.

Order of operations:

1. In Clerk, create the application (development instance first). Then use
   **Create production instance** with `talestogether.xyz` as the domain.
2. Add the Vercel and Clerk records in Namecheap Advanced DNS (above). If the DNS
   ever moves to Cloudflare, set the Clerk CNAMEs to **DNS only** (grey cloud),
   or Clerk's check fails. Keep the apex free of CAA records that block Let's
   Encrypt or Google Trust Services (`dig talestogether.xyz +short CAA` should
   print nothing).
3. Wait for both dashboards to verify (up to 48 hours, usually minutes). In
   Clerk, press **Deploy certificates**.
4. In Clerk: set the access mode to **Invite-only**, enable the email-code
   sign-in, activate the **Convex** integration, and copy the production
   Frontend API URL and `pk_live_…` key into Convex/Vercel.
5. Send yourself an invite first. `.xyz` domains have a poor spam reputation
   with some mail providers. Confirm invites and sign-in codes arrive in the
   inbox (Gmail, iCloud, Outlook) before inviting family. If they land in spam,
   tell guests to check spam once and mark the sender safe.

### 3. First-deploy data

- **Seed the catalogue once**, before anyone opens the app. Either use the
  Convex dashboard Functions page to run internal `migrations:seedCatalog`, or
  run `npx convex run migrations:seedCatalog --prod` from a shell configured
  for the cloud project. The workshop shelves are empty without it.
- **Optional: bring local books across.**
  `npx convex export --include-file-storage --path snapshot.zip` against the
  Docker backend, then `npx convex import --prod snapshot.zip` against cloud.
  Snapshots exclude code, env vars and pending scheduled functions. Test this
  on a throwaway cloud deployment first; local data includes test stories.

### 4. Preview deployments (optional, later)

Generate a **preview deploy key** in Convex project settings and set it as
`CONVEX_DEPLOY_KEY` for Vercel's **Preview** environment only. Each branch then
gets its own empty Convex backend. Add `--preview-run` with a seeding
function so previews have a catalogue. Check whether `--preview-run` accepts an
internal function; if not, expose a preview-only seed wrapper. Preview backends
call paid providers too, so give them their own capped keys or
`IMAGE_PROVIDER=disabled`.

### 5. Verify after the first deploy

- Signed out: the app shows only the sign-in screen. A direct call to a public
  function (e.g. `npx convex run stories:listByIds '{"storyIds":[]}' --prod`,
  which runs with no identity) is refused with "Please sign in to use Tales
  Together."
- An uninvited email cannot sign up; an invited one can.
- Signed in, on desktop and on the iPad: the home screen loads, and the shelves
  show the 62 seeded choices.
- Book cap: set `DAILY_BOOK_LIMIT` to `1` temporarily. The second new book of
  the day is refused with the friendly message. Then reset it to `10`.
- Help → Diagnostics → Check connection shows the `*.convex.cloud` backend and
  `production`.
- Make one full book: pitch, write, illustrate, export. Then download the EPUB
  in Safari and on desktop. Storage-URL downloads crossed CORS correctly
  locally; confirm the same on cloud.
- Record a spoken idea over HTTPS on the iPad (first real secure-context test).
- Deep-link reload on `/story/<id>` works (rewrite in place).
- `npm run diagnostics -- health --prod` and `usage --prod` work against cloud.

## Day-to-day workflow after go-live

- Local development is unchanged. Keep the Docker backend and `.env.local`
  with `CONVEX_SELF_HOSTED_*`.
- The Convex CLI refuses to mix self-hosted variables with cloud credentials.
  For manual production commands, use a clean shell:
  `env -u CONVEX_SELF_HOSTED_URL -u CONVEX_SELF_HOSTED_ADMIN_KEY …`
  with `CONVEX_DEPLOY_KEY`, or a separate checkout. A cloud dev deployment
  for development is optional and not required.
- Deploy = merge to `main`. Roll back the frontend with Vercel "Instant
  Rollback". The backend has no automatic rollback: revert the commit and
  redeploy. Schema changes must stay backward compatible, because the old
  bundle can be open in a tab during a deploy.
- Run `npm run check` in CI (GitHub Actions) before merge. The Vercel build
  should stay lean and not repeat it.
- Production logs: Convex dashboard Logs, plus `npx convex logs --prod`. Free
  and Starter plans have no log streaming or daily backups. Take a manual
  backup (dashboard) before risky migrations.

## Native distribution (later)

Not needed to share the web app; the iPad already runs it in Safari.

- **iOS:** EAS Build → TestFlight needs the Apple Developer Program
  (US$99/year). Internal TestFlight testers need no review; external testers
  need a light beta review.
- **Android:** EAS Build → Play Console internal testing (one-off $25 developer
  fee), or share an APK directly.
- Native builds read `EXPO_PUBLIC_CONVEX_URL` at build time as well. Set it in
  `eas.json` per build profile to the production `*.convex.cloud` URL.
- EAS Update can ship JS-only fixes to installed builds, but it must be kept
  compatible with the deployed Convex functions.

## Open questions

- "Recent stories" is device-scoped for now. Two people sharing one iPad see
  the same shelf. A per-user list would introduce ownership and needs its own
  `decisions.md` entry.
- Should `writeChapter` retries and art regeneration also count against a cap,
  or is the books-per-day cap plus prepaid balances enough? Revisit after the
  D4 diagnostics baseline from real use.

## Sources

- [Convex: Using Convex with Vercel](https://docs.convex.dev/production/hosting/vercel)
  (deploy key, build command, previews, `--cmd-url-env-var-name`, `--preview-run`)
- [Convex: Environment variables](https://docs.convex.dev/production/environment-variables)
- [Convex: Limits](https://docs.convex.dev/production/state/limits) and
  [pricing](https://www.convex.dev/pricing)
- [Convex: Self-hosting guide](https://stack.convex.dev/self-hosted-develop-and-deploy),
  [export](https://docs.convex.dev/cli/reference/export),
  [import](https://docs.convex.dev/cli/reference/import)
- [Expo: Publish websites](https://docs.expo.dev/guides/publishing-websites/)
  (output modes, Vercel `vercel.json`, Netlify redirects)
- [Expo Hosting: get started](https://docs.expo.dev/eas/hosting/get-started/)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby),
  [pricing](https://vercel.com/pricing),
  [Shareable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links)
- [Convex & Clerk](https://docs.convex.dev/auth/clerk) (`auth.config.ts`,
  `CLERK_JWT_ISSUER_DOMAIN`, `ConvexProviderWithClerk`)
- [Clerk: Restricting access](https://clerk.com/docs/guides/secure/restricting-access)
  (Invite-only mode; allowlist/blocklist paid in production),
  [deploying to production](https://clerk.com/docs/guides/development/deployment/production)
  (own domain + DNS required), [pricing](https://clerk.com/pricing)
- [Convex Auth](https://labs.convex.dev/auth) (beta)
