const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

/* ---------- TMDB helpers ---------- */

async function tmdb(path, key, params = {}) {
  const qs = new URLSearchParams({ api_key: key, ...params });
  const res = await fetch(`${TMDB_API}${path}?${qs}`);
  if (res.status === 401) throw new Error("TMDB APIキーが無効です。設定を確認してください。");
  if (!res.ok) throw new Error(`TMDB error (${res.status})`);
  return res.json();
}

/* Search TMDB for candidates matching an AniList media entry.
   TV shows often group multi-cour series under the first air year,
   so we retry without the year filter when the first pass is empty. */
async function tmdbFindCandidates(media, key) {
  const isMovie = media.format === "MOVIE";
  const kind = isMovie ? "movie" : "tv";
  const title = media.title?.native || media.title?.romaji || media.title?.english;
  if (!title) return [];
  const year = media.startDate?.year || media.seasonYear;
  const base = { query: title, language: "ja-JP", include_adult: "true" };
  let results = [];
  if (year) {
    const r = await tmdb(`/search/${kind}`, key, {
      ...base,
      [isMovie ? "year" : "first_air_date_year"]: String(year),
    });
    results = r.results || [];
  }
  if (!results.length) {
    const r = await tmdb(`/search/${kind}`, key, base);
    results = r.results || [];
  }
  return results.slice(0, 6).map((x) => ({
    id: x.id,
    type: kind,
    name: x.name || x.title || "",
    year: (x.first_air_date || x.release_date || "").slice(0, 4),
  }));
}

/* Per-cour precision (HANDOFF §10 P3): TMDB often files a franchise as one
   show with several seasons, while AniList splits every cour. Pick the latest
   regular season (season 0 = specials, ignored) that had started by the
   AniList start date (+21 days of slack for listing drift). Shows TMDB keeps
   as one long season return null — the series overview is the right one. */
const SEASON_SLACK_MS = 21 * 24 * 3600 * 1000;

function pickSeason(regular, media) {
  if (regular.length <= 1) return null;
  const sd = media?.startDate;
  if (!sd?.year) return null;
  const start = Date.UTC(sd.year, (sd.month || 1) - 1, sd.day || 1) + SEASON_SLACK_MS;
  let best = null;
  for (const s of regular) {
    const t = Date.parse(s.air_date || "");
    if (Number.isFinite(t) && t <= start && (!best || t >= Date.parse(best.air_date))) best = s;
  }
  return best ? best.season_number : null;
}

/* map: { id, type, season? } — season undefined = not decided yet (auto-pick,
   caller persists it), null = whole series (explicit), n = that season.
   /tv/{id}?language=ja-JP already carries each season's JA overview, so the
   per-season synopsis costs no extra request. Empty season overview falls
   back to the series overview. */
async function tmdbDetails(map, key, media) {
  const [det, prov] = await Promise.all([
    tmdb(`/${map.type}/${map.id}`, key, { language: "ja-JP" }),
    tmdb(`/${map.type}/${map.id}/watch/providers`, key),
  ]);
  const regular = (det.seasons || []).filter((s) => s.season_number > 0);
  const autoPicked = map.type === "tv" && map.season === undefined;
  const season = autoPicked ? pickSeason(regular, media) : map.season ?? null;
  const seasonOverview =
    season != null ? (regular.find((s) => s.season_number === season)?.overview || "").trim() : "";
  return {
    overview: seasonOverview || (det.overview || "").trim(),
    seasonUsed: !!seasonOverview,
    season,
    autoPicked,
    seasons: regular.map((s) => ({
      n: s.season_number,
      year: (s.air_date || "").slice(0, 4),
    })),
    name: det.name || det.title || "",
    jp: prov?.results?.JP || null,
    tmdbUrl: `https://www.themoviedb.org/${map.type}/${map.id}${season != null ? `/season/${season}` : ""}?language=ja`,
  };
}

export { tmdbFindCandidates, tmdbDetails, TMDB_IMG };
