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

async function tmdbDetails(map, key) {
  const [det, prov] = await Promise.all([
    tmdb(`/${map.type}/${map.id}`, key, { language: "ja-JP" }),
    tmdb(`/${map.type}/${map.id}/watch/providers`, key),
  ]);
  return {
    overview: (det.overview || "").trim(),
    name: det.name || det.title || "",
    jp: prov?.results?.JP || null,
    tmdbUrl: `https://www.themoviedb.org/${map.type}/${map.id}?language=ja`,
  };
}

export { tmdbFindCandidates, tmdbDetails, TMDB_IMG };
