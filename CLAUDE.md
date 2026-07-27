# CLAUDE.md — 季節帳 (Kisetsuchō)

Personal, login-free, Japanese-primary seasonal anime tracker (Letterboxd-style, no social).
Single user, lives in Japan, watches in Japanese. **Read `HANDOFF.md` before any non-trivial task** — it is the authoritative spec (architecture §4–6, design system §7, roadmap §10, invariants §13).

## Commands

```bash
npm run dev                        # Vite dev server → http://localhost:5173
npm run build                      # production build (must pass before commit)
python3 scripts/build_html.py      # optional: regenerate standalone dist-standalone/kisetsucho.html
```

## Architecture in one paragraph

React 18 SPA, currently one file (`src/App.jsx`, ~2150 lines incl. embedded CSS string). No router — `view` state machine (browse/search/list/stats) + modal overlays (detail, seiyuu, settings). Data: AniList GraphQL (no auth; browsing/search/detail/cast/relations) + TMDB REST (key; Japanese synopses + JP streaming providers via JustWatch data). Persistence: `window.storage` abstraction (shimmed to localStorage in `src/main.jsx`) under `kisetsucho:*` keys; ledger schema and export format in HANDOFF §5.

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

- `idMal` is NOT yet in `MEDIA_FIELDS` — required first step for Annict work (HANDOFF §10.1).
- Annict seasons: lowercase `"2026-summer"`, and uses `autumn` where AniList uses `FALL`. Annict CORS is unverified — test a bare fetch before building on it.
- TMDB files multi-cour anime under the first air year → matcher retries without year; matches cached in `kisetsucho:tmdbmap` with a user-facing correction UI. Preserve "match once, cache, user can fix".
- Secrets: TMDB key → `.env.local` (`VITE_TMDB_KEY`, gitignored); future Annict token → storage-only via settings, never in source or exports.
- The user's real data exists — treat `kisetsucho:entries` and export files as precious; when in doubt, export first.

## Verification before any commit (HANDOFF §9)

1. `npm run build` passes; dev console clean.
2. Query-builder brace-balance loop over all 26 combinations (snippet in HANDOFF §9).
3. Smoke test: browse current season → track a show through 視聴中→視聴済 with rating/memo → reload persists → detail modal shows JA synopsis + attributed 配信（日本） → seiyuu link round-trip → ledger grouping → export/import round-trip → 統計 renders.
4. A pre-change export file still imports cleanly.

## Working style

- Explain tradeoffs plainly (capable user, not a professional dev); use plan mode for multi-file or schema-touching work and get approval first.
- Refactors are sanctioned but behavior-preserving, gated by the verification protocol.
- Never silently drop a feature — flag retirements explicitly (e.g., the standalone HTML build).
