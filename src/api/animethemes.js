/* ---------- 主題歌 (OP/ED) data ----------
   Primary: AnimeThemes (api.animethemes.moe) — free, no key, CORS-open,
   looks works up by AniList id in batches, 90 req/min. Song titles are
   romanized there. Best-effort extra: Jikan (MyAnimeList data) for kanji
   titles, detail modal only — it is often down (504) and slow-limited, so
   any failure silently falls back to the romanized title.
   Cache: kisetsucho:themes { [anilistId]: { themes, ja?, at, final } } —
   device-side only, never exported. Finished works never refetch; airing
   works refresh after 7 days, works AnimeThemes lacks after 30. */

import { THEMES_KEY, storageGetJson, storageSetJson } from "../storage.js";

const API = "https://api.animethemes.moe/anime";
const DAY_MS = 24 * 3600 * 1000;
const BATCH = 50;

async function atGet(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) throw new Error("AnimeThemesへのリクエストが多すぎます。1分ほど待ってから再試行してください。");
  if (!res.ok) throw new Error(`AnimeThemes API error (${res.status})`);
  return res.json();
}

/* one AnimeThemes animetheme → our shape */
function toTheme(t, animeSlug) {
  return {
    slug: t.slug,                          // "OP1", "ED2", "ED1-TV"
    type: t.type,                          // "OP" | "ED"
    sequence: t.sequence || 1,
    title: t.song?.title || "",
    artists: (t.song?.artists || []).map((a) => a.name),
    episodes: t.animethemeentries?.[0]?.episodes || "",
    url: `https://animethemes.moe/anime/${animeSlug}/${t.slug}`,
  };
}

const byType = (a, b) => (a.type === b.type ? 0 : a.type === "OP" ? -1 : 1) || a.sequence - b.sequence;

/* AniList ids → Map id → theme list (missing ids → []). Batched ×50,
   follows pagination, 700 ms between requests. */
async function fetchThemesRaw(anilistIds) {
  const out = new Map(anilistIds.map((id) => [id, []]));
  let first = true;
  for (let i = 0; i < anilistIds.length; i += BATCH) {
    const qs = new URLSearchParams({
      "filter[has]": "resources",
      "filter[site]": "AniList",
      "filter[external_id]": anilistIds.slice(i, i + BATCH).join(","),
      include: "resources,animethemes.song.artists,animethemes.animethemeentries",
      "fields[resource]": "site,external_id",
      "page[size]": "100",
    });
    let url = `${API}?${qs}`;
    while (url) {
      if (!first) await new Promise((r) => setTimeout(r, 700));
      first = false;
      const d = await atGet(url);
      for (const a of d.anime || []) {
        const themes = (a.animethemes || []).map((t) => toTheme(t, a.slug)).sort(byType);
        for (const r of a.resources || []) {
          if (r.site === "AniList" && out.has(r.external_id)) out.set(r.external_id, themes);
        }
      }
      url = d.links?.next || null;
    }
  }
  return out;
}

/* ---------- Jikan kanji titles (best-effort) ---------- */

const JA_CHARS = /[぀-ヿ㐀-鿿]/;

/* '1: "Yuusha (勇者)" by YOASOBI (eps 1-16)' → { n: 1, ja: "勇者", artistJa } */
function parseJikanTheme(s, i) {
  const m = (s || "").match(/^(?:#?(\d+):\s*)?"(.+?)"\s+by\s+(.+?)(?:\s+\((?:eps?|episodes?)\b[^)]*\))?\s*$/i);
  if (!m) return null;
  const inParens = (x) => {
    const p = x.match(/\(([^()]+)\)\s*$/);
    return p && JA_CHARS.test(p[1]) ? p[1].trim() : JA_CHARS.test(x) ? x.trim() : null;
  };
  return { n: m[1] ? Number(m[1]) : i + 1, ja: inParens(m[2]), artistJa: inParens(m[3]) };
}

async function fetchJaTitles(idMal) {
  const res = await fetch(`https://api.jikan.moe/v4/anime/${idMal}/themes`);
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  const d = (await res.json()).data || {};
  const pick = (list) => Object.fromEntries(
    (list || []).map(parseJikanTheme).filter((x) => x && (x.ja || x.artistJa)).map((x) => [x.n, x]));
  return { OP: pick(d.openings), ED: pick(d.endings) };
}

/* ---------- cache ---------- */

let cache = null;
async function loadCache() {
  if (!cache) cache = await storageGetJson(THEMES_KEY, {});
  return cache;
}
function saveCache() { storageSetJson(THEMES_KEY, cache); }

function fresh(c) {
  if (!c) return false;
  if (c.final && c.themes.length) return true;
  const ttl = c.themes.length ? 7 * DAY_MS : 30 * DAY_MS;
  return Date.now() - c.at < ttl;
}

/* getThemes(items) — items: [{ id, final }] (final = AniList status
   FINISHED). Returns Map id → cache record. Fetches only stale/missing. */
async function getThemes(items, { onProgress } = {}) {
  const c = await loadCache();
  const need = items.filter((it) => !fresh(c[it.id])).map((it) => it.id);
  if (need.length) {
    onProgress?.({ n: 0, total: need.length });
    for (let i = 0; i < need.length; i += BATCH) {
      const chunk = need.slice(i, i + BATCH);
      const got = await fetchThemesRaw(chunk);
      const now = Date.now();
      for (const id of chunk) {
        const it = items.find((x) => x.id === id);
        c[id] = { ...(c[id] || {}), themes: got.get(id) || [], at: now, final: !!it?.final };
      }
      onProgress?.({ n: Math.min(i + BATCH, need.length), total: need.length });
    }
    saveCache();
  }
  return new Map(items.map((it) => [it.id, c[it.id]]));
}

/* Kanji titles for one work, cached on its record once found. */
const jaTried = new Set(); // one Jikan attempt per work per session
async function getJaTitles(id, idMal) {
  const c = await loadCache();
  if (c[id]?.ja) return c[id].ja;
  if (!idMal || jaTried.has(id)) return null;
  jaTried.add(id);
  try {
    const ja = await fetchJaTitles(idMal);
    if (c[id]) { c[id] = { ...c[id], ja }; saveCache(); }
    return ja;
  } catch {
    return null; // Jikan / MAL down — romanized titles stand
  }
}

/* display helpers shared by the detail section and the export */
function themeTitleJa(t, ja) {
  const hit = ja?.[t.type]?.[t.sequence];
  return hit?.ja || null;
}
function themeArtist(t, ja) {
  return ja?.[t.type]?.[t.sequence]?.artistJa || t.artists.join("、");
}

export { getThemes, getJaTitles, themeTitleJa, themeArtist, parseJikanTheme };
