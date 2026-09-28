# 季節帳 (Kisetsuchō) — Seasonal Anime Ledger
## Developer Handoff Document (v4 → Claude Code)

**Last updated:** 2026-09-28 (P3 complete — see §10)
**Handoff from:** Claude (claude.ai chat, iterative prototyping)
**Handoff to:** Claude Code (repo-based development)
**Companion files:** `CLAUDE.md` (session instructions), `scripts/build_html.py` (standalone build), `main.jsx` (Vite entry with storage shim), `kisetsucho.jsx` (the entire v4 application)

---

## 1. What this project is

A **personal, login-free, Japanese-primary seasonal anime tracker** — "Letterboxd for anime, minus the social layer" — built for a user living in Japan who watches anime exclusively in Japanese.

It exists because MyAnimeList fails this user in three specific ways, and these are the **founding constraints** — violating them is a regression even if the code is "better":

1. **No mandatory account.** The app must be fully useful with zero login. API keys/tokens (TMDB now, Annict later) are *optional enhancements* configured in a settings panel, never gates.
2. **Franchises feel unified, not fragmented.** Databases split multi-cour series into separate entries; the app compensates with a clickable 関連作品 (related works) graph in every detail view so a franchise navigates as one family.
3. **Japanese-first presentation.** Native titles in a mincho serif are primary; English/romaji are secondary small text. Cast and voice actors display native names (CV: 声優名). UI chrome is Japanese with small English sublabels. Synopses prefer Japanese (TMDB) and fall back to English (AniList) with an explicit language label.

The user is technically capable but not a professional developer. Explanations should stay accessible; decisions with tradeoffs should be surfaced, not silently made.

---

## 2. Current state: v4 feature inventory

Everything below is implemented and working in `kisetsucho.jsx` (single-file React app, ~2,150 lines including embedded CSS):

**Browsing**
- Season browser: decade dropdown → year chips → four season tabs rendered as large kanji (冬春夏秋), each with its own accent color that tints the entire UI when selected.
- Two scope tabs beyond seasons: 年間 (entire year) and 年代 (entire decade), each with distinct accent colors.
- Sort selector: 人気順 / 評価順 / 放送日 new・old / タイトル順 (AniList `MediaSort`).
- Format filter chips (TVアニメ/劇場版/OVA/ONA/スペシャル/TVショート/ミュージック), multi-select, API-level (`format_in`).
- Genre filter chips (18 genres, Japanese labels, `genre_in`), multi-select, API-level.
- R18 filter: adult works excluded by default (`isAdult: false` in query); toolbar toggle reveals them with a red R18 badge. Applies to browse, search, and seiyuu role lists. **Nothing is ever deleted — display filter only.**
- すべて表示 (load all): sequential auto-pagination, capped at `MAX_AUTO_PAGES` (12 pages × 50 = ~600 works) with 700 ms inter-page delay for rate limits; cancellable mid-run; posts a notice when capped.
- Per-card synopsis expansion (続きを読む) + global あらすじを全文表示 toggle.
- Cards show: cover, native title, EN/romaji subtitle, format/episodes/studio, air/release date (放送開始/公開/発売・公開 per format), synopsis, 公式サイト + AniList links, status buttons, and inline progress/rating controls.
- Search box accepts Japanese or English (AniList `SEARCH_MATCH`).

**Tracking (the ledger)**
- Four statuses: 見たい (want) / 視聴中 (watching) / 視聴済 (watched) / 中断 (dnf). Toggling the active status off removes the entry entirely.
- Half-star ratings 0.5–5.0 (Letterboxd-style, left/right click zones per star).
- Completion date (完了日/中断日), auto-set to today on first mark, editable via date input.
- Episode progress for 視聴中: −/＋ counter with progress bar (`7 / 12話`); marking watched auto-fills progress to episode count.
- Rewatch counter (再視聴 n回) on watched entries.
- Free-text メモ・感想 per entry (saves on blur).
- Ledger view: status tabs with counts, sort dropdown (完了日/放送シーズン new・old/評価/タイトル), **grouped section headers that adapt to the sort** (completion month, season like 2025年秋, or star value), stats summary line on the watched tab.
- ランダムに選ぶ button on the 見たい tab → opens a random want-list entry's detail view.
- Export (dated JSON download) / Import (merge, imported wins on conflict) — this is the cross-device/cross-browser bridge and the user's backup lifeline.

**Detail view (modal)**
- Full metadata, genres (Japanese labels), status/progress/rating/rewatch/memo controls.
- リンク section: 公式サイト (prioritized), AniList, other info links.
- **TMDB-powered あらすじ**: Japanese overview primary when available, collapsible English (AniList) beneath; graceful labeled fallback to English when TMDB has no JA text or no match.
- **配信（日本）**: JP-region availability grouped 見放題/レンタル/購入 with provider logos, linked via JustWatch page, with the **required attribution line** (see §6.2). AniList streaming links render only as fallback when TMDB has no JP data.
- TMDB match correction UI (照合を修正): lists search candidates, lets user pick correct match or 該当なし; choice persisted.
- キャラクター・声優 grid with native names; **every CV: name is a button** → seiyuu modal.
- 関連作品 relation graph with Japanese relation tags (続編/前作/外伝/…), clickable navigation.

**Seiyuu modal**
- Staff photo + native name; paginated role history (newest first) via AniList `Staff.characterMedia`; rows show 主演/脇役/その他 tag, character native name, work title, season; clicking a work jumps to its detail modal. Respects R18 toggle.

**Stats view (統計)**
- Overview cards (per-status counts, average rating, total rewatches); CSS bar charts for watched-by-air-year and watched-by-completion-year; per-season average rating in season colors; format breakdown; rating distribution histogram (0.5–5.0).

**Settings (⚙)**
- TMDB API key field, persisted to storage. The user's personal key is baked in as `DEFAULT_TMDB_KEY` (see §12 security note).

---

## 3. Proposed repository layout

The v4 app is deliberately one file (chat-iteration constraint). Claude Code is **sanctioned to refactor** into modules — see §13 invariants for what must survive refactoring.

```
kisetsucho/
├── CLAUDE.md                  # Claude Code session instructions (provided)
├── HANDOFF.md                 # this document
├── package.json               # Vite + React
├── index.html                 # Vite entry
├── .env.local                 # VITE_TMDB_KEY=... (gitignored!)
├── .gitignore                 # must include .env.local
├── src/
│   ├── main.jsx               # entry + window.storage shim (provided)
│   └── App.jsx                # ← contents of kisetsucho.jsx
├── scripts/
│   └── build_html.py          # regenerates standalone kisetsucho.html (provided)
└── dist-standalone/
    └── kisetsucho.html        # single-file build artifact (generated)
```

Bootstrap sequence (already validated with the user on a previous round):

```bash
npm create vite@latest kisetsucho -- --template react
cd kisetsucho && npm install
# copy in: CLAUDE.md, HANDOFF.md, scripts/build_html.py
# replace src/App.jsx with kisetsucho.jsx contents
# replace src/main.jsx with the provided main.jsx
# delete the `import './index.css'` line if present; delete src/index.css, src/App.css
npm run dev   # http://localhost:5173
```

---

## 4. Architecture

**Stack:** React 18, functional components + hooks only, no router (view state machine in `App`), no external state library, no CSS framework — a single CSS template string (`const CSS`) injected via `<style>`, driven by CSS custom properties.

**View state machine:** `view ∈ {browse, search, list, calendar, stats}` + `scope ∈ {season, year, decade}` (browse only). Modals are independent overlays: `detailId`, `seiyuuId`, `settingsOpen`, `syncOpen` — all rendered through `components/Modal.jsx` (focus trap, Escape closes the topmost only, focus returns to the opener). Seiyuu modal stacks above detail modal (z-index 60 vs 50); opening a work from the seiyuu modal closes it and swaps `detailId`.

**Component tree (all in App.jsx):**
```
App
├── header (brand / search form / nav: さがす・記録・統計・⚙)
├── season-nav (decade select, year chips, season+scope tabs, toolbar, filter rows)
├── browse/search grid → AnimeCard × n
│     └── StatusButtons, ProgressControls, WatchedControls(+StarRating), MemoBox
├── list view → grouped ledger items (same control components)
├── StatsView (BarRow helpers)
├── DetailModal
│     └── TmdbSection (self-contained TMDB fetch/match/fix logic)
├── SeiyuuModal
└── SettingsModal
```

**Data flow:** All server data is fetched on demand; nothing is cached between sessions except the TMDB match map. `entries` (the ledger) is the single source of user truth, mirrored to storage on every mutation through one `mutate(media, fn)` helper — all setters (`setStatus`, `setRating`, `setDate`, `setMemo`, `setProgress`, `setRewatch`) route through it.

**GraphQL queries are built dynamically** (`buildBrowseQuery(scope, {useFormats, useGenres, hideAdult})`, `buildSearchQuery({hideAdult})`) because AniList ignores absent filters but chokes on explicit nulls/empty arrays — do not "simplify" this into one static query with nullable variables; it was a deliberate fix. 26 builder combinations exist; the verification snippet in §11 checks brace balance across all of them.

---

## 5. Persistence layer

**Abstraction:** all storage flows through `window.storage` with this contract (matches the Claude.ai artifact storage API):

```js
await window.storage.get(key)          // → {key, value} | throws if missing
await window.storage.set(key, value)   // value is a string
await window.storage.delete(key)
await window.storage.list(prefix)
```

In the Vite/local build, `src/main.jsx` shims this onto `localStorage` (see provided `main.jsx`). **Keep this abstraction** — it is the seam for any future backend (Annict sync, file persistence, etc.).

**Storage keys:**
| Key | Contents |
|---|---|
| `kisetsucho:entries` | the ledger — `{ [anilistId]: Entry }` |
| `kisetsucho:settings` | `{ tmdbKey: string }` (extend here for Annict token) |
| `kisetsucho:tmdbmap` | `{ [anilistId]: {id, type: "tv"\|"movie", season?} \| {none: true} }` — `season` (2026-09): undefined = not decided yet (auto-pick by air date, then cached), `null` = whole series, n = TMDB season n |

**Entry schema** (fields optional unless noted):

```ts
{
  id: number,              // AniList media id — REQUIRED, primary key
  status: "want" | "watching" | "hold" | "watched" | "dnf",   // REQUIRED ("hold" = 保留, since v5)
  title: { native?, romaji?, english? },
  cover: string,           // AniList cover URL snapshot
  format: string,          // AniList MediaFormat
  season: "WINTER"|"SPRING"|"SUMMER"|"FALL",
  seasonYear: number,
  episodes: number,
  rating: number,          // 0.5–5.0 in 0.5 steps
  completedDate: "YYYY-MM-DD",
  progress: number,        // episodes watched
  rewatchCount: number,
  memo: string,
  studios: string[],       // v5, optional — main studio names (snapshot)
  genres: string[],        // v5, optional — AniList genre keys (snapshot)
  titleKana: string,       // v5, optional — reading from Annict Work.titleKana
  updatedAt: number        // Date.now(), maintained by mutate(); NOT bumped by snapshot refreshes
}
```

**Export format** (round-trips through import; import merges with imported-wins semantics):
```json
{ "app": "kisetsucho", "version": 5, "exportedAt": "ISO-8601", "entries": { ... } }
```
Import also accepts a bare entries map for resilience. Export building and import migration live in `src/ledger.js` (`buildExport`, `migrateImport`, per-version `MIGRATIONS` table), fixture-checked by `npm run check:ledger`.

**Version history:** v4 = chat-era format. **v5 (2026-09)** adds the `hold` (保留) status and optional snapshot fields — additive only, so v4 files import unchanged. Entries with no usable id or an unknown status (only possible from a newer app version) are skipped and counted in the import message; files from a newer version still import with a warning. **Any schema change requires a version bump plus a migration path for old export files** — the user has real data and has already been burned once (see below).

**History lesson — the localStorage origin problem:** the user's v1 data vanished moving to v2 because browsers give `file://`-opened HTML inconsistent, sometimes per-file storage origins. That is why export/import exists and why the Vite `localhost` origin (stable) matters. Treat the export file as the canonical backup; never remove or weaken that feature.

---

## 6. External data sources

### 6.1 AniList (primary spine — no auth)

- Endpoint: `POST https://graphql.anilist.co` (JSON GraphQL). CORS-open.
- Used for: seasonal/year/decade browsing, search (JA+EN), detail metadata, characters + Japanese VAs, relations, staff role histories, external links (official site, info, streaming fallback).
- Key queries in code: dynamic browse/search builders (§4), `DETAIL_QUERY`, `STAFF_QUERY` (`Staff.characterMedia` = voice roles, paginated 25/page).
- Season mapping: WINTER=1–3月, SPRING=4–6月, SUMMER=7–9月, FALL=10–12月.
- Decade scope uses `startDate_greater/lesser` with `FuzzyDateInt` (`YYYYMMDD` ints, e.g. `20100000`–`20200000`).
- **Rate limits:** officially 90 req/min but degraded to ~30/min for extended periods; the app assumes the conservative number. `gql()` maps 429 → friendly Japanese error. すべて表示 exists specifically to stay under this (page cap + delay). Do not remove the cap or delay without a queueing strategy.
- Synopses (`description`) are **English-only** — a hard upstream limitation, the reason TMDB exists in this app.
- ⚠️ `idMal` is **not currently in `MEDIA_FIELDS`** — it must be added when Annict integration starts (it's the join key, §10.1).

### 6.2 TMDB (Japanese synopses + JP streaming — free personal API key)

- Base: `https://api.themoviedb.org/3`, images `https://image.tmdb.org/t/p/{size}{path}` (logos w45/w92). Key passed as `api_key` query param. CORS-open.
- Endpoints used:
  - `GET /search/tv` | `/search/movie` — matching (`language=ja-JP`, `include_adult=true`, year filters `first_air_date_year`/`year`)
  - `GET /{type}/{id}?language=ja-JP` — `overview` = Japanese synopsis
  - `GET /{type}/{id}/watch/providers` — `results.JP.{link, flatrate, rent, buy}`
- **Matching algorithm** (`tmdbFindCandidates`): AniList `format === "MOVIE"` → movie search, else tv search. Query = native title, filtered by start year; if zero results, **retry without year** (TMDB files multi-cour series under first-air year — a 2025 sequel cour lives under the 2021 show). First result auto-accepted, cached in `kisetsucho:tmdbmap`; user can override via candidate picker or mark `{none:true}`. Each show is matched at most once ever unless corrected.
- **JustWatch attribution is a legal requirement of TMDB's terms**: provider data must be attributed to JustWatch, and links should go to TMDB/JustWatch pages, not scraped deep links. Implemented as the 配信情報：JustWatch提供（TMDB経由） line + link. **Never remove this.** Footer carries attribution too.
- Known quirks: multi-cour series share one TMDB overview (series-level, not per-cour — see roadmap §10.3); JA overview coverage thins for obscure/old OVAs (labeled EN fallback handles it); JustWatch coverage in JP skews toward international services (dアニメストア/U-NEXT presence is inconsistent) — the UI carries a caveat, keep it.

### 6.3 JustWatch directly — investigated, rejected

Official API is partner-contract-only ("bigger partners and clients"); unofficial wrappers are ToS-risky and unstable. TMDB is the sanctioned personal-project route. Do not add a direct JustWatch client.

---

## 7. Design system

**Aesthetic:** Japanese print — washi paper ground, ink text, mincho serif display type over gothic sans body, seasonal accent theming. The signature element is the season-tab kanji whose color tints the whole UI (`--accent`, `--accent-soft` set inline on `.app`).

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FAF9F5` | page background |
| `--card` | `#FFFFFF` | cards, modals, header |
| `--ink` | `#23252B` | primary text |
| `--ink-soft` | `#6B6D75` | secondary text |
| `--line` | `#E6E3DA` | borders |
| 冬 WINTER | `#5B7A99` / soft `#EDF1F5` | season accent |
| 春 SPRING | `#BC5F7D` / `#F8EEF1` | season accent |
| 夏 SUMMER | `#2E7D6B` / `#E9F2EF` | season accent |
| 秋 FALL | `#BE5730` / `#F8EFE9` | season accent |
| 年間 year scope | `#55597A` / `#EDEEF4` | scope accent |
| 年代 decade scope | `#715C8C` / `#F0EDF5` | scope accent |
| list/stats views | `#3A3D46` / `#ECEBE6` | neutral accent |
| R18 badge | `#A03D3D` | adult marker |

**Type:** display/serif `"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif` (brand, titles, group headers, stat numbers); body/sans `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif`. System JP fonts by design (no webfont dependency); if adding Noto via fontsource later, keep the system stack as fallback.

**Language policy:** UI labels Japanese with tiny uppercase English hints (`.en-hint`); titles native-first; dates in 年月日; statuses/relations/roles/genres all have JA label maps (`FORMAT_JA`, `RELATION_JA`, `ROLE_JA`, `GENRES`). New UI must follow this pattern.

**Responsive:** grid `auto-fill minmax(230px,1fr)`; one 640px breakpoint. iPhone Safari is a first-class target (the user's eventual daily driver — see deployment roadmap).

---

## 8. The standalone HTML build

`scripts/build_html.py` converts `src/App.jsx` into a single self-contained `kisetsucho.html` (React + ReactDOM + babel-standalone from cdnjs, storage shim inlined, in-browser JSX transform). This was the zero-setup distribution during chat prototyping.

**Post-migration policy:** the Vite app is now primary. Keep the script working while it's cheap (it only needs `import`/`export default` stripping to keep matching — it currently regex-strips all top-level imports and the default export). If the refactor splits App.jsx into many modules, either teach the script to bundle via `npx vite build` + single-file plugin, or retire it deliberately and tell the user — don't let it rot silently.

---

## 9. Verification protocol (run after every change set)

1. `npm run dev` boots without console errors; `npm run build` succeeds.
2. **Query-builder brace balance** (all 26 combinations) — port of the check used throughout chat development:
```js
for (const scope of ["season","year","decade"])
 for (const useFormats of [true,false])
  for (const useGenres of [true,false])
   for (const hideAdult of [true,false]) {
     const q = buildBrowseQuery(scope,{useFormats,useGenres,hideAdult});
     console.assert((q.match(/{/g)||[]).length === (q.match(/}/g)||[]).length, "unbalanced", scope);
   }
```
3. **Manual smoke test:** current season loads → mark a show 視聴中 → progress +2 → mark 視聴済 (progress auto-fills, date=today) → rate 4.5★ → memo → reload page (persists) → detail modal shows JA synopsis + 配信（日本）with attribution → click a CV name → seiyuu roles load → click a work → detail opens → 記録 shows grouped entry → エクスポート downloads → インポート round-trips → 統計 renders → filters (format+genre+R18) return sensible results → 年代 scope + すべて表示 caps politely.
4. **Export compatibility:** a v4 export file must import cleanly after any change.
5. If `scripts/build_html.py` still supported: run it, open output, verify boot.

---

## 10. Roadmap (priority order)

### P0 — Repo hygiene (first Claude Code session)
- Bootstrap repo per §3; commit; verify §9 end-to-end.
- Move the TMDB key out of source: `VITE_TMDB_KEY` in `.env.local` (gitignored), read via `import.meta.env.VITE_TMDB_KEY` as the default; settings-panel override still wins. Note: a Vite env var is still visible in the shipped bundle — acceptable for a free TMDB key on a personal app, but the repo itself must not carry it if ever made public. The key currently hardcoded as `DEFAULT_TMDB_KEY` belongs to the user; if the repo will be public, rotate it (TMDB Settings → API).
- Optional sanctioned refactor: split App.jsx into modules (`api/anilist.js`, `api/tmdb.js`, `storage.js`, `components/…`, `styles.css`). Behavior-preserving; §13 invariants apply; §9 gates the merge.

### P1 — Annict integration (the flagship next feature)
The user is **explicitly open to token-based login** for this. Full spec:

- Auth: user creates a personal access token (no OAuth needed) at annict.com → 設定 → デベロッパー. Store in `kisetsucho:settings` as `annictToken` via the settings panel (new field).
- Endpoint: `POST https://api.annict.com/graphql`, header `Authorization: bearer <token>`.
- **Join key:** Annict `Work.malAnimeId` ↔ AniList `Media.idMal` → **add `idMal` to `MEDIA_FIELDS` first.** Fallback join: title/year fuzzy match with a manual fixer (mirror the TMDB pattern — same UX, new map key `kisetsucho:annictmap`).
- Season string format: `"2026-summer"` — lowercase, and **Annict uses `autumn` where AniList uses `FALL`** (mapping required: WINTER→winter, SPRING→spring, SUMMER→summer, FALL→autumn).
- Read features to add to the detail modal:
  - 放送情報: `Work.programs` → channel name + `startedAt` (Japanese TV channels and air times — data no Western API has).
  - Japanese staff roles: `Work.staffs` with `roleText` (監督/シリーズ構成/etc. in Japanese).
  - 満足度: `Work.satisfactionRate` + `watchersCount` (Japanese-community rating alongside AniList's).
  - `Work.titleKana` (enables kana-aware title sort later).
- Write features (this is the cross-device sync path — the reason for the whole integration):
  - Status sync mapping: `want→WANNA_WATCH`, `watching→WATCHING`, `watched→WATCHED`, `dnf→STOP_WATCHING` (Annict `StatusState` also has `ON_HOLD` and `NO_STATE`; a future 保留 status could map to ON_HOLD).
  - Mutations: `updateStatus(workId, state)`; per-episode `createRecord` can mirror episode progress.
  - Design as **explicit opt-in two-way sync** with a visible sync button before attempting anything automatic; conflict rule proposal: most-recent-`updatedAt` wins, surfaced to the user.
- ⚠️ **Unverified risk:** whether api.annict.com sends CORS headers for browser calls is unknown (community usage is mostly server-side/GAS). Test first with a bare fetch. If blocked: dev = Vite proxy (`server.proxy` in `vite.config.js` mapping `/annict` → `https://api.annict.com`); prod = a serverless proxy function (Netlify/Vercel) that forwards the request with the token. Do not ship the token through any third-party proxy.

### P2 — Deployment (iPhone access)
- Static deploy (Netlify / Vercel / GitHub Pages) — no backend needed for current features; env var for the TMDB key at build time.
- Add PWA manifest + icons so it installs to the iPhone home screen; consider a service worker for shell caching (data stays live).
- Storage on iPhone Safari: localStorage persists per-origin but iOS can evict storage for rarely-used sites — surface a gentle periodic "エクスポートでバックアップ" reminder, and note this is another argument for Annict-as-backend.

### P3 — Refinements — ✅ done 2026-09 (branch `p3-buildout`)
- ✅ Per-cour TMDB precision — `tmdbDetails` picks the TMDB season by air date (latest regular season started by the AniList start date + 21 d); the per-season JA overview already comes with `/tv/{id}?language=ja-JP`, so no extra request. tmdbmap gains `season` (see §5); season chips in 照合を修正. Many anime sit in one long TMDB "Season 1" — those correctly keep the series overview.
- ✅ Kana-aware ledger タイトル順 — `src/kana.js`; readings snapshot as `titleKana` from the detail modal, sync, or the ledger's 読みがなを取得 button. 五十音 group headers appear only once a reading exists (no-token ledger unchanged).
- ✅ 保留 fifth status ↔ Annict ON_HOLD — export **v5** + migration (`src/ledger.js`, `check:ledger`).
- ✅ Watched-episode auto-suggest — inline 「全n話を視聴しました。視聴済にする」 (suggestion only).
- ✅ Stats — 月別ペース (24 months), 連続記録 (month streaks), top studios/genres (from the v5 snapshot fields).
- ✅ Airing calendar — new 放送 view. **Syoboi Calendar is not callable from the browser** (`cal.syoboi.jp` sends no CORS headers — probed 2026-09-28), so the calendar is AniList `airingSchedule` (no key) + Annict channel names when a token is set, with per-work しょぼいカレンダー links via `syobocalTid`. Fetching Syoboi directly would need the serverless proxy described under P1.
- ✅ A11y pass — shared `Modal.jsx` (focus trap, Escape, focus return), aria-live on async status lines.
- ✅ Also fixed along the way: §11 #3 (memo autosave) and #4 (snapshot refresh).

---

## 11. Known issues & sharp edges

1. `TmdbSection`'s first render for an unmatched show does search → `onMap` → early-return, relying on the prop change to re-trigger the effect for the detail fetch. It works but is subtle — refactor candidate (single async flow), keep the "match once, cache forever" behavior.
2. Seiyuu role lists show one row per character-media edge; long-running franchises repeat across seasons. Intentional (it shows the actual role history) but could gain optional grouping.
3. ~~`MemoBox` saves on blur only~~ — **resolved 2026-09**: debounced autosave (800 ms) + flush on blur, unmount, `visibilitychange`→hidden and `pagehide` (via `flushSync`, so the localStorage write lands before iOS freezes the page).
4. ~~Ledger entries never refresh their snapshot~~ — **resolved 2026-09**: opening the detail modal refreshes title/cover/format/season/episodes/studios/genres via `refreshSnapshot` (utils `snapshotFields`), which deliberately does **not** bump `updatedAt` (that field means "user changed something" and feeds Annict conflict proposals).
5. In-browser babel-standalone in the HTML build means a visible compile pause on slow devices — acceptable for the fallback artifact, irrelevant post-Vite.
6. `search` view ignores format/genre filters by design (only the R18 filter applies) — revisit only with UI that makes active-filter state obvious.
7. Decade browsing + タイトル順 sort exposes AniList's odd native-title collation for numeric-leading titles — upstream, not ours.

---

## 12. Security & privacy notes

- `DEFAULT_TMDB_KEY` in source is the **user's personal key** (they pasted it in chat; they know). Free tier, low abuse value, trivially rotatable — but P0 moves it to `.env.local`, and it must never land in a public repo. Rotation: themoviedb.org → Settings → API.
- The future Annict token is more sensitive (it can *write* to the user's account): storage-only via settings panel, never in source, never in exports, never through third-party proxies.
- Export files contain personal viewing history + memos — treat as private user data; never add telemetry.

---

## 13. Invariants (survive any refactor)

1. Zero-login default path — the app must work fully with no keys configured.
2. Japanese-primary presentation everywhere (§7 language policy).
3. `window.storage` abstraction stays as the persistence seam; `kisetsucho:` key namespace stays.
4. Export/import keeps backward compatibility (version bump + migration for schema changes).
5. JustWatch/TMDB attribution stays wherever provider data renders.
6. R18 remains filter-not-deletion, default-hidden.
7. AniList rate-limit protections (page cap + inter-page delay) stay, in whatever form.
8. Seasonal accent theming and the 季節帳 identity stay.
9. Kill nothing silently: retire features (e.g., the HTML build) only explicitly, telling the user.

---

## 14. Suggested opening prompts for Claude Code

Session 1 (setup): *"Read HANDOFF.md and CLAUDE.md fully. Execute the P0 roadmap: bootstrap the Vite repo per §3 using the provided files, move the TMDB key to .env.local per §10, then run the §9 verification protocol and report results before committing."*

Session 2 (refactor, optional): *"Per HANDOFF.md §10 P0, split src/App.jsx into modules behavior-preservingly. §13 invariants apply. Gate with §9, including an export/import round-trip with a real v4 export file."*

Session 3 (Annict): *"Implement HANDOFF.md §10.1 read-features first: settings token field, idMal join, 放送情報 + 満足度 in the detail modal, with the CORS test as step zero. Plan mode first — show me the plan before writing code."*

— End of handoff —
