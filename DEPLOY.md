# DEPLOY.md — publishing 季節帳

Getting the app onto the web (Vercel) and onto an iPhone home screen. Vite is zero-config on Vercel — no `vercel.json`, no build settings to fill in.

## 1. Publish to Vercel

**Route A — CLI, no GitHub needed**

1. From the project folder: `npx vercel` — the first run walks you through login and project linking interactively (accept the detected Vite defaults). This gives a preview URL.
2. `npx vercel --prod` publishes to the real production URL.

**Route B — GitHub import, auto-deploy**

1. Push the repo to GitHub, then on vercel.com: Add New → Project → import the repo. Vite is detected automatically.
2. From then on, every push to `main` deploys.

**TMDB key (either route):** Vercel dashboard → the project → Settings → Environment Variables → add `VITE_TMDB_KEY` with your key, then redeploy. Be aware: any `VITE_*` value is baked readable into the shipped JS bundle, so anyone with the URL could extract it. That's the accepted tradeoff for this free personal TMDB key — if it ever bothers you, rotate it at themoviedb.org → Settings → API. The Annict token is different: it is entered at runtime in ⚙ and stored only in the browser, never in the bundle.

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

- Route A: run `npx vercel --prod` again.
- Route B: push to `main`.

The service worker fetches the shell network-first, so a new deploy shows up on the next launch with a connection; cached copies only serve when offline.
