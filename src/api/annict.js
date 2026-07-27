/* ---------- Annict GraphQL (HANDOFF §10.1 — read features) ----------
   Auth: personal access token (settings), bearer header, required for every
   query. CORS on api.annict.com verified open (2026-07 browser probe) — direct
   calls, no proxy. searchWorks has NO MyAnimeList-id filter, so the AniList
   join (Media.idMal ↔ Work.malAnimeId) searches candidates by title (then by
   season) and verifies malAnimeId client-side; resolved annictIds are cached
   in kisetsucho:annictmap. */

const ANNICT_API = "https://api.annict.com/graphql";

async function annictGql(query, variables, token) {
  const res = await fetch(ANNICT_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401)
    throw new Error("Annictトークンが無効です。設定を確認してください。");
  if (res.status === 429)
    throw new Error("Annictへのリクエストが多すぎます。しばらく待ってから再試行してください。");
  if (!res.ok) throw new Error(`Annict API error (${res.status})`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || "GraphQL error");
  return json.data;
}

/* Annict uses "autumn" where AniList uses FALL; season strings are lowercase. */
const SEASON_TO_ANNICT = { WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "autumn" };

function toAnnictSeason(season, year) {
  const s = SEASON_TO_ANNICT[season];
  return s && year ? `${year}-${s}` : null;
}

const MATCH_FIELDS = `
  annictId
  malAnimeId
  title
`;

const TITLE_SEARCH = `
query ($titles: [String!], $first: Int) {
  searchWorks(titles: $titles, first: $first) {
    nodes {
      ${MATCH_FIELDS}
    }
  }
}`;

const SEASON_SEARCH = `
query ($seasons: [String!], $first: Int, $after: String) {
  searchWorks(seasons: $seasons, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ${MATCH_FIELDS}
    }
  }
}`;

const DETAILS_QUERY = `
query ($annictIds: [Int!]) {
  searchWorks(annictIds: $annictIds, first: 1) {
    nodes {
      annictId
      satisfactionRate
      watchersCount
      programs(first: 50) {
        nodes {
          startedAt
          rebroadcast
          channel { name }
        }
      }
      staffs(first: 30) {
        nodes { name roleText sortNumber }
      }
    }
  }
}`;

/* Resolve an AniList media entry to an Annict work via malAnimeId.
   Title search first (1 request, usually enough), then a season scan
   fallback for retitled/multi-cour cases. Returns {annictId} or null. */
async function findAnnictWork(media, token) {
  const mal = media.idMal ? String(media.idMal) : null;
  if (!mal) return null;

  const title = media.title?.native || media.title?.romaji;
  if (title) {
    const d = await annictGql(TITLE_SEARCH, { titles: [title], first: 20 }, token);
    const hit = (d.searchWorks?.nodes || []).find((w) => w.malAnimeId === mal);
    if (hit) return { annictId: hit.annictId };
  }

  const season = toAnnictSeason(media.season, media.seasonYear);
  if (season) {
    let after = null;
    for (let page = 0; page < 3; page++) {
      const d = await annictGql(SEASON_SEARCH, { seasons: [season], first: 100, after }, token);
      const conn = d.searchWorks;
      const hit = (conn?.nodes || []).find((w) => w.malAnimeId === mal);
      if (hit) return { annictId: hit.annictId };
      if (!conn?.pageInfo?.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
  }
  return null;
}

async function annictWorkDetails(annictId, token) {
  const d = await annictGql(DETAILS_QUERY, { annictIds: [annictId] }, token);
  const w = d.searchWorks?.nodes?.[0];
  if (!w) return null;
  return {
    annictId: w.annictId,
    satisfactionRate: w.satisfactionRate,
    watchersCount: w.watchersCount,
    programs: w.programs?.nodes || [],
    staffs: (w.staffs?.nodes || []).slice().sort((a, b) => a.sortNumber - b.sortNumber),
    url: `https://annict.com/works/${w.annictId}`,
  };
}

export { annictGql, toAnnictSeason, findAnnictWork, annictWorkDetails };
