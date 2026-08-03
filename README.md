# 季節帳 (Kisetsuchō) — Seasonal Anime Ledger

Personal, login-free, Japanese-primary seasonal anime tracker: a Letterboxd-style private ledger with no social layer. Browse any season back to the 1960s via AniList (no auth), track shows through 見たい / 視聴中 / 視聴済 / 中断 with ratings, dates and memos, and — with optional keys — get Japanese synopses and JP streaming availability from TMDB (JustWatch data) plus Japanese broadcast info and community satisfaction from Annict. Everything is stored in the browser under `kisetsucho:*` keys, with JSON export/import as the backup mechanism.

## Commands

```bash
npm run dev                # Vite dev server → http://localhost:6173 (fixed port, strictPort)
npm run build              # production build
npm run check:queries      # query-builder brace balance (all 26 combinations)
npm run build:standalone   # single-file dist-standalone/kisetsucho.html (keyless by design)
npm run lint               # oxlint
```

## Docs

- `HANDOFF.md` — the authoritative spec: architecture, data schema, design system, roadmap, invariants.
- `CLAUDE.md` — working rules and verification protocol for coding sessions.
- `DEPLOY.md` — publishing to Vercel and installing on an iPhone home screen.
