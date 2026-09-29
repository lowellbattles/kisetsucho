/* ---------- 他サービスから取り込む — pure import logic ----------
   No network, no DOM, no React: parsers for MyAnimeList exports, AniList
   list entries and pasted title lists / Netflix CSVs, mappers to v5 ledger
   entries (HANDOFF §5), and the preview plan. Checked by
   scripts/check-import.mjs. The ImportModal does the fetching. */

import { snapshotFields } from "./utils.js";

/* ---------- MyAnimeList XML export ---------- */

const MAL_STATUS = {
  watching: "watching", "1": "watching",
  completed: "watched", "2": "watched",
  "on-hold": "hold", onhold: "hold", "3": "hold",
  dropped: "dnf", "4": "dnf",
  "plan to watch": "want", plantowatch: "want", "6": "want",
};

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/* one <tag>value</tag> from a flat block; CDATA-aware; "" when absent */
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>|<${name}\\s*/>`));
  if (!m || m[1] === undefined) return "";
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeXml(m[1])).trim();
}

/* MAL dates are "YYYY-MM-DD" with 00 for unknown parts */
function malDate(s) {
  const m = (s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || m[1] === "0000") return undefined;
  const month = m[2] === "00" ? "01" : m[2];
  const day = m[3] === "00" ? "01" : m[3];
  return `${m[1]}-${month}-${day}`;
}

/* parseMalXml(text) → rows; throws if it isn't a MAL anime export */
function parseMalXml(text) {
  if (!/<myanimelist[\s>]/.test(text || "")) throw new Error("not a MyAnimeList export");
  const rows = [];
  for (const [, block] of text.matchAll(/<anime>([\s\S]*?)<\/anime>/g)) {
    const malId = parseInt(tag(block, "series_animedb_id"), 10);
    if (!Number.isFinite(malId)) continue;
    rows.push({
      malId,
      title: tag(block, "series_title"),
      status: MAL_STATUS[tag(block, "my_status").toLowerCase()] || null,
      score: parseInt(tag(block, "my_score"), 10) || 0,
      watchedEps: parseInt(tag(block, "my_watched_episodes"), 10) || 0,
      finishDate: malDate(tag(block, "my_finish_date")),
      timesWatched: parseInt(tag(block, "my_times_watched"), 10) || 0,
      comments: tag(block, "my_comments"),
    });
  }
  return rows;
}

/* MAL row + AniList media → v5 entry (without updatedAt; set on apply) */
function mapMalRow(row, media) {
  const e = { id: media.id, status: row.status, ...snapshotFields(media) };
  if (row.score > 0) e.rating = Math.min(10, row.score) / 2;
  if (row.watchedEps > 0) e.progress = row.watchedEps;
  if ((row.status === "watched" || row.status === "dnf") && row.finishDate) e.completedDate = row.finishDate;
  if (row.timesWatched > 0) e.rewatchCount = row.timesWatched;
  if (row.comments) e.memo = row.comments;
  return e;
}

/* ---------- AniList MediaListCollection entry ---------- */

const ANILIST_STATUS = {
  CURRENT: "watching", REPEATING: "watching", PLANNING: "want",
  COMPLETED: "watched", PAUSED: "hold", DROPPED: "dnf",
};

const halfStar = (tenPoint) => Math.round(Math.min(10, tenPoint)) / 2; // 0–10 → nearest ★0.5

function fuzzyDate(d) {
  if (!d?.year) return undefined;
  const p = (n) => String(n || 1).padStart(2, "0");
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

/* entry: { status, score (POINT_10_DECIMAL), progress, repeat, notes, completedAt, media } */
function mapAniListEntry(entry) {
  const status = ANILIST_STATUS[entry.status];
  if (!status || !entry.media?.id) return null;
  const e = { id: entry.media.id, status, ...snapshotFields(entry.media) };
  if (entry.score > 0) e.rating = Math.max(0.5, halfStar(entry.score));
  if (entry.progress > 0) e.progress = entry.progress;
  const done = fuzzyDate(entry.completedAt);
  if ((status === "watched" || status === "dnf") && done) e.completedDate = done;
  if (entry.repeat > 0) e.rewatchCount = entry.repeat;
  if (entry.notes) e.memo = entry.notes.trim();
  return e;
}

/* ---------- pasted title lists / Netflix viewing-history CSV ---------- */

/* minimal CSV line split (quotes, doubled quotes) */
function csvCells(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/* Netflix dates: 2024/3/22, 3/22/24, 2024-03-22 → YYYY-MM-DD */
function looseDate(s) {
  let m = (s || "").match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = (s || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // US order (Netflix EN)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return undefined;
}

/* "葬送のフリーレン: シーズン1: 旅立ち" → "葬送のフリーレン" */
const SEASON_SPLIT = /:\s*(?:シーズン|Season|第\s*\d+\s*期|Part|パート|Limited Series|リミテッドシリーズ|Volume|Chapter|Collection)/i;
function showName(title) {
  const cut = title.split(SEASON_SPLIT)[0];
  return (cut === title ? title.split(/:\s*(?:エピソード|Episode|第\s*\d+\s*話)/i)[0] : cut).trim();
}

const BULLET = /^\s*(?:[-*•・●○◯✓✔☑︎✅□■◆◇→>]+|\d+[.)．、]|[（(]\d+[)）])\s*/;

/* parseTitleList(text) → [{ title, date? }] — deduped, latest date kept */
function parseTitleList(text) {
  const lines = (text || "").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const netflix = lines.length > 0 && /^"?(title|タイトル)"?\s*,\s*"?(date|日付)"?$/i.test(lines[0]);
  const byTitle = new Map();
  for (const line of netflix ? lines.slice(1) : lines) {
    let title;
    let date;
    if (netflix) {
      const [t, d] = csvCells(line);
      title = showName(t || "");
      date = looseDate(d);
    } else {
      title = line.replace(BULLET, "").trim();
    }
    if (!title) continue;
    const key = title.toLowerCase();
    const prev = byTitle.get(key);
    if (!prev) byTitle.set(key, { title, ...(date ? { date } : {}) });
    else if (date && (!prev.date || date > prev.date)) prev.date = date;
  }
  return [...byTitle.values()];
}

/* ---------- preview plan ---------- */

/* planImport(incoming, entries) → { add, existing }
   - add:      entries not in the ledger yet
   - existing: [{ incoming, current, same }] — kept by default; the UI lets
               the user flip each (or all) to 上書き. `same` = status,
               rating, progress and completion date already match. */
function planImport(incoming, entries) {
  const add = [];
  const existing = [];
  const seen = new Set();
  for (const e of incoming) {
    if (!e || seen.has(e.id)) continue; // duplicate rows in one file: first wins
    seen.add(e.id);
    const current = entries[e.id];
    if (!current) { add.push(e); continue; }
    const same = ["status", "rating", "progress", "completedDate"].every(
      (k) => (e[k] ?? null) === (current[k] ?? null));
    existing.push({ incoming: e, current, same });
  }
  return { add, existing };
}

/* merge for 上書き: imported fields win, local-only fields (memo if the
   import has none, rewatch count…) are kept */
function mergeOverwrite(current, incoming) {
  return { ...current, ...incoming };
}

export {
  parseMalXml, mapMalRow, mapAniListEntry, parseTitleList, planImport, mergeOverwrite,
  malDate, looseDate, showName,
};
