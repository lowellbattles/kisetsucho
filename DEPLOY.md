# DEPLOY.md — publishing 季節帳

Getting the app onto the web and onto an iPhone home screen. **Current host: GitHub Pages** at <https://lowellbattles.github.io/kisetsucho/> (same setup as the user's other projects). The build uses relative asset paths (`base: "./"` in `vite.config.js`), so the same build also works at a domain root — Vercel remains a drop-in alternative (§5).

## 1. GitHub Pages (current)

How it works: `.github/workflows/deploy-pages.yml` runs on every push to `main` (doc-only `*.md` commits are skipped; there's also a manual **Run workflow** button under Actions). It installs, runs the three fixture checks, builds with `VITE_TMDB_KEY` from the repo secret, and publishes `dist/` via GitHub's Pages deploy action. A failing check stops the deploy.

One-time setup (already done if the site is live):

1. Public repo `lowellbattles/kisetsucho` (free-plan Pages needs a public repo; the TMDB key has never been committed, `.env.local` and the chat-era source drops are gitignored).
2. Repo secret: `gh secret set VITE_TMDB_KEY` (or Settings → Secrets and variables → Actions).
3. Pages source = GitHub Actions: `gh api repos/lowellbattles/kisetsucho/pages -X POST -f build_type=workflow` (or Settings → Pages → Source: GitHub Actions).

**TMDB key visibility:** any `VITE_*` value is baked readable into the shipped JS bundle, so anyone with the URL could extract it. That's the accepted tradeoff for this free personal key — if it ever bothers you, rotate it at themoviedb.org → Settings → API and update the secret. The Annict token is different: it is entered at runtime in ⚙ and stored only in the browser, never in the bundle.

**Shared origin — know this:** every project under `lowellbattles.github.io` shares **one browser origin**, so they share localStorage (one ~5 MB quota) and each project's JavaScript could read the others' keys, including `kisetsucho:settings` (Annict token). All keys here are `kisetsucho:`-namespaced, so nothing collides — the concern is isolation, not overwriting. The fix, if wanted later, is a custom domain (e.g. `kisetsucho.example.com`) — it gets its own origin. Moving origins means export → import once.

## 2. iPhone home-screen install

Safari で本番URLを開く → 共有（share）→「ホーム画面に追加」。

**Storage — read this before entering any data.** The installed home-screen app keeps its data in its **own separate storage silo** — nothing saved while browsing in a Safari tab carries over into it, and vice versa. The installed app is also **exempt from Safari's 7-day storage eviction**; a plain Safari tab is not. So the order matters:

1. Install to the home screen **first**.
2. Open the installed app and do the setup **inside it**: paste the Annict token in ⚙, インポート your data there.
3. Keep using エクスポート periodically — it remains the real backup regardless.

## 3. Per-device setup

- **TMDB key** — comes from the build environment automatically; nothing to do per device.
- **Annict token** — paste into ⚙ once on each device/browser profile (it lives in that browser's storage only, never in the bundle or in export files).

## 4. Updating

Push to `main`. Watch it under the repo's **Actions** tab (~1 min). The service worker fetches the shell network-first, so a new deploy shows up on the next launch with a connection; cached copies only serve when offline.

## 5. Alternative: Vercel

Still works unchanged (relative paths are fine at a domain root) and gives the app its own origin plus room for a serverless proxy (e.g. for Syoboi Calendar, which blocks browser calls).

- **CLI:** `npx vercel` (login + link, accept Vite defaults) → `npx vercel --prod`.
- **GitHub import:** vercel.com → Add New → Project → import `lowellbattles/kisetsucho`; every push to `main` deploys.
- TMDB key: Vercel → project → Settings → Environment Variables → `VITE_TMDB_KEY`, then redeploy.
- Moving hosts = new origin = export on the old site, import on the new one.
