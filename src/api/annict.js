/* ---------- Annict GraphQL (HANDOFF §10.1 — read features + status sync) ----------
   Auth: personal access token (settings), bearer header, required for every
   query. CORS on api.annict.com verified open (2026-07 browser probe) — direct
   calls, no proxy. searchWorks has NO MyAnimeList-id filter, so the AniList
   join (Media.idMal ↔ Work.malAnimeId) searches candidates by title (then by
   season) and verifies malAnimeId client-side; resolved ids are cached in
   kisetsucho:annictmap as {annictId, id} (id = relay global Work.id, needed by
   the updateStatus mutation; old cache entries may lack it — callers tolerate). */

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
  if (res.status === 403)
    throw new Error("Annictトークンに書き込み権限がありません。「読み込み + 書き込み」スコープでトークンを再発行してください。");
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
  id
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
      id
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
   fallback for retitled/multi-cour cases. Returns {annictId, id} or null. */
async function findAnnictWork(media, token) {
  const mal = media.idMal ? String(media.idMal) : null;
  if (!mal) return null;

  const title = media.title?.native || media.title?.romaji;
  if (title) {
    const d = await annictGql(TITLE_SEARCH, { titles: [title], first: 20 }, token);
    const hit = (d.searchWorks?.nodes || []).find((w) => w.malAnimeId === mal);
    if (hit) return { annictId: hit.annictId, id: hit.id };
  }

  const season = toAnnictSeason(media.season, media.seasonYear);
  if (season) {
    let after = null;
    for (let page = 0; page < 3; page++) {
      const d = await annictGql(SEASON_SEARCH, { seasons: [season], first: 100, after }, token);
      const conn = d.searchWorks;
      const hit = (conn?.nodes || []).find((w) => w.malAnimeId === mal);
      if (hit) return { annictId: hit.annictId, id: hit.id };
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
    id: w.id,
    annictId: w.annictId,
    satisfactionRate: w.satisfactionRate,
    watchersCount: w.watchersCount,
    programs: w.programs?.nodes || [],
    staffs: (w.staffs?.nodes || []).slice().sort((a, b) => a.sortNumber - b.sortNumber),
    url: `https://annict.com/works/${w.annictId}`,
  };
}

/* ---------- status sync (HANDOFF §10.1 write features) ---------- */

const LIBRARY_QUERY = `
query ($states: [StatusState!], $first: Int, $after: String) {
  viewer {
    libraryEntries(states: $states, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        work { id annictId malAnimeId title }
        status { state createdAt }
      }
    }
  }
}`;

/* The 4 states the v1 sync supports (ON_HOLD / NO_STATE are not requested —
   a future 保留 status could map ON_HOLD, HANDOFF §10.1). */
const LIBRARY_STATES = ["WANNA_WATCH", "WATCHING", "WATCHED", "STOP_WATCHING"];

/* Read the authenticated user's whole library, paginated 100/page with a
   safety cap (~1000 entries). Rows with a null status are skipped. */
async function fetchLibrary(token) {
  const rows = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const d = await annictGql(LIBRARY_QUERY, { states: LIBRARY_STATES, first: 100, after }, token);
    const conn = d.viewer?.libraryEntries;
    for (const n of conn?.nodes || []) {
      if (!n?.work || !n.status) continue;
      rows.push({
        workId: n.work.id,
        annictId: n.work.annictId,
        malAnimeId: n.work.malAnimeId ?? null,
        title: n.work.title,
        state: n.status.state,
        stateChangedAt: n.status.createdAt,
      });
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return rows;
}

const WORK_IDS_QUERY = `
query ($ids: [Int!]) {
  searchWorks(annictIds: $ids, first: 50) {
    nodes { annictId id }
  }
}`;

/* Backfill relay global Work.ids for old annictmap entries ({annictId} only).
   Chunked ×50; returns Map annictId → global id. */
async function resolveWorkIds(annictIds, token) {
  const map = new Map();
  for (let i = 0; i < annictIds.length; i += 50) {
    const d = await annictGql(WORK_IDS_QUERY, { ids: annictIds.slice(i, i + 50) }, token);
    for (const n of d.searchWorks?.nodes || []) map.set(n.annictId, n.id);
  }
  return map;
}

const UPDATE_STATUS_MUTATION = `
mutation ($workId: ID!, $state: StatusState!) {
  updateStatus(input: { workId: $workId, state: $state }) {
    work { annictId viewerStatusState }
  }
}`;

/* Write one status to Annict. Insufficient scope can surface as a GraphQL-level
   error rather than HTTP 403 (undocumented upstream) — decorate the message
   with a token-scope hint unless it already mentions the token. */
async function pushStatus(workId, state, token) {
  try {
    const d = await annictGql(UPDATE_STATUS_MUTATION, { workId, state }, token);
    return d.updateStatus?.work || null;
  } catch (e) {
    const msg = e?.message || String(e);
    if (!msg.includes("トークン"))
      throw new Error(`${msg}（トークンが「読み込み + 書き込み」スコープか確認してください）`);
    throw e;
  }
}

export {
  annictGql, toAnnictSeason, findAnnictWork, annictWorkDetails,
  fetchLibrary, resolveWorkIds, pushStatus,
};
