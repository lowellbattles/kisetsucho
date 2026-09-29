# CLAUDE.md — 季節帳 (Kisetsuchō)

Personal, login-free, Japanese-primary seasonal anime tracker (Letterboxd-style, no social).
Single user, lives in Japan, watches in Japanese. **Read `HANDOFF.md` before any non-trivial task** — it is the authoritative spec (architecture §4–6, design system §7, roadmap §10, invariants §13).

## Commands

```bash
npm run dev                # Vite dev server → http://localhost:6173 (fixed port, strictPort)
npm run build              # production build (must pass before commit)
npm run check:queries      # §9.2 query-builder brace balance (all 26 combinations)
npm run check:sync         # sync-plan fixture checks (src/sync.js diff logic)
npm run check:ledger       # export/import migration fixture checks (src/ledger.js) — v4 + v5 files
npm run check:import       # 他サービス import fixtures (src/importers.js) — MAL XML, AniList, Netflix CSV
npm run build:standalone   # regenerate standalone dist-standalone/kisetsucho.html (keyless by design)
```

## Architecture in one paragraph

React 18 SPA, modular since the 2026-07 refactor. `src/App.jsx` (~860 lines) is the orchestrator: no router — `view` state machine (browse/search/list/calendar/stats) + modal overlays (detail, seiyuu, settings, sync — all via `components/Modal.jsx`), all user edits through one `mutate()` helper (bumps `updatedAt`); data-only snapshot refreshes go through `refreshSnapshot()` (does not). Around it: `src/api/anilist.js` (gql + dynamic query builders + `PER_PAGE`/`MAX_AUTO_PAGES` rate-limit constants), `src/api/tmdb.js` (matcher + details), `src/api/annict.js` (bearer-auth gql + idMal join + work details + library read/status write), `src/sync.js` (pure sync-plan diff logic, fixture-checked), `src/ledger.js` (export format v5 + import migration, fixture-checked), `src/kana.js` (五十音 title ordering), `src/importers.js` (MAL/AniList/text import parsing, fixture-checked), `src/api/animethemes.js` (主題歌 + cache), `src/constants.js` (JA label maps), `src/utils.js`, `src/storage.js` (keys + JSON helpers), `src/env.js` (TMDB key default from `.env.local`, read lazily — see its comment), `src/components/` (Modal, ListSection, controls, AnimeCard, TmdbSection, AnnictSection, ThemesSection, DetailModal, SeiyuuModal, SettingsModal, SyncModal, ImportModal, ThemesExportModal, CalendarView, StatsView), `src/styles.css`. Data: AniList GraphQL (no auth; browsing/search/detail/cast/relations) + TMDB REST (key; Japanese synopses + JP streaming providers via JustWatch data). Persistence: `window.storage` abstraction (shimmed to localStorage in `src/main.jsx`) under `kisetsucho:*` keys; ledger schema and export format in HANDOFF §5. The standalone build is `scripts/build_standalone.mjs` (real Vite build inlined into one HTML file; replaced the retired chat-era `build_html.py`).

## Hard invariants (HANDOFF §13 — never violate)

- App fully works with **zero login/keys**; keys are optional enhancements via ⚙ settings.
- **Japanese-primary UI**: native titles first (mincho serif), EN/romaji secondary; JA labels with small EN hints; new strings follow the `FORMAT_JA`/`GENRES`-style label-map pattern.
- Keep the `window.storage` seam and `kisetsucho:` namespace.
- Export/import backward compatibility; schema changes need a version bump + migration.
- Keep JustWatch/TMDB attribution wherever provider data shows (TMDB terms requirement).
- R18 = default-hidden display filter, never deletion.
- Keep AniList rate-limit guards (page cap + delay in すべて表示); AniList realistically allows ~30 req/min.
- GraphQL queries are **built dynamically** (`buildBrowseQuery`) because AniList rejects null/empty filter variables — don't collapse into one static query.

## Gotchas

- `idMal` is in `MEDIA_FIELDS` and is the Annict join key (`Media.idMal` ↔ `Work.malAnimeId`). Annict's `searchWorks` has **no MAL-id filter** — `findAnnictWork` (api/annict.js) searches by title then season and verifies `malAnimeId` client-side; resolved ids cached in `kisetsucho:annictmap` as `{annictId, id}` (`id` = relay global Work.id, required by the `updateStatus` mutation; old entries may lack it and are backfilled at sync time).
- Sync (記録 → Annictと同期) is strictly opt-in: preview plan → user confirm → sequential writes. Requires a 読み込み + 書き込み token; pushes only ever send the 4 mapped `StatusState`s. Conflict proposals compare local `updatedAt` vs remote `Status.createdAt` — both approximations, user can flip each.
- Deployed via GitHub Pages at `lowellbattles.github.io/kisetsucho/` (sub-path!): keep asset/manifest/SW paths **relative** (`base: "./"`); never reintroduce root-absolute `/…` URLs. Push to `main` = deploy (`.github/workflows/deploy-pages.yml`, gated by the fixture checks). DEPLOY.md has the details.
- Every bulk write to the ledger (Annict pull, 他サービス import) goes preview → confirm → one `applyEntries` batch. Never write during matching.
- Jikan (MAL data) is unreliable (504s in 2026-09) — only ever a best-effort extra with silent fallback; AnimeThemes is the 主題歌 source of truth.
- Syoboi Calendar (`cal.syoboi.jp`) sends **no CORS headers** (probed 2026-09) — link to it via Annict `syobocalTid`, never fetch it from the browser.
- `updatedAt` means "the user changed something" (Annict conflict proposals). Background data refreshes (covers, studios, genres, `titleKana`) must use `refreshSnapshot`, not `mutate`.
- Annict seasons: lowercase `"2026-summer"`, and uses `autumn` where AniList uses `FALL` (`SEASON_TO_ANNICT` in api/annict.js). CORS on api.annict.com is **verified open** (2026-07 browser probe) — direct browser calls, no proxy needed.
- TMDB files multi-cour anime under the first air year → matcher retries without year; matches cached in `kisetsucho:tmdbmap` with a user-facing correction UI. Preserve "match once, cache, user can fix".
- Secrets: TMDB key → `.env.local` (`VITE_TMDB_KEY`, gitignored); Annict token → storage-only via ⚙ settings (`kisetsucho:settings.annictToken`), never in source or exports.
- The user's real data exists — treat `kisetsucho:entries` and export files as precious; when in doubt, export first.

## Verification before any commit (HANDOFF §9)

1. `npm run build` passes; dev console clean.
2. `npm run check:queries` → 26/26 balanced (committed port of the HANDOFF §9 snippet); `npm run check:sync`, `npm run check:ledger` and `npm run check:import` pass.
3. Smoke test: browse current season → track a show through 視聴中→視聴済 with rating/memo → reload persists → detail modal shows JA synopsis + attributed 配信（日本） → seiyuu link round-trip → ledger grouping → export/import round-trip → 統計 renders.
4. A pre-change export file still imports cleanly.

## Working style

- Explain tradeoffs plainly (capable user, not a professional dev); use plan mode for multi-file or schema-touching work and get approval first.
- Refactors are sanctioned but behavior-preserving, gated by the verification protocol.
- Never silently drop a feature — flag retirements explicitly (e.g., the standalone HTML build).
