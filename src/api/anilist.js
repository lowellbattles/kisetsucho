const API = "https://graphql.anilist.co";
const PER_PAGE = 50;
const MAX_AUTO_PAGES = 12;

/* ---------- AniList queries ---------- */

const MEDIA_FIELDS = `
  id
  idMal
  title { native romaji english }
  description
  coverImage { large color }
  episodes
  format
  status
  season
  seasonYear
  startDate { year month day }
  averageScore
  isAdult
  siteUrl
  studios(isMain: true) { nodes { name } }
  externalLinks { site url type language }
`;

const PAGE_SHELL = (varDefs, args) => `
query (${varDefs}) {
  Page(page: $page, perPage: ${PER_PAGE}) {
    pageInfo { hasNextPage currentPage }
    media(${args}) {
      ${MEDIA_FIELDS}
    }
  }
}`;

function buildBrowseQuery(scope, { useFormats, useGenres, hideAdult }) {
  const base = {
    season: ["$season: MediaSeason, $year: Int", "season: $season, seasonYear: $year"],
    year:   ["$year: Int", "seasonYear: $year"],
    decade: ["$after: FuzzyDateInt, $before: FuzzyDateInt", "startDate_greater: $after, startDate_lesser: $before"],
  }[scope];
  const varDefs = [base[0], "$page: Int", "$sort: [MediaSort]"];
  const args = [base[1], "type: ANIME", "sort: $sort"];
  if (useFormats) { varDefs.push("$formats: [MediaFormat]"); args.push("format_in: $formats"); }
  if (useGenres) { varDefs.push("$genres: [String]"); args.push("genre_in: $genres"); }
  if (hideAdult) args.push("isAdult: false");
  return PAGE_SHELL(varDefs.join(", "), args.join(", "));
}

function buildSearchQuery({ hideAdult }) {
  const args = ["search: $q", "type: ANIME", "sort: SEARCH_MATCH"];
  if (hideAdult) args.push("isAdult: false");
  return PAGE_SHELL("$q: String, $page: Int", args.join(", "));
}

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id) {
    ${MEDIA_FIELDS}
    genres
    duration
    characters(sort: [ROLE, RELEVANCE], perPage: 12) {
      edges {
        role
        node { id name { native full } image { medium } }
        voiceActors(language: JAPANESE, sort: RELEVANCE) { id name { native full } }
      }
    }
    relations {
      edges {
        relationType
        node {
          id type format season seasonYear
          title { native romaji }
          coverImage { medium }
        }
      }
    }
  }
}`;

const STAFF_QUERY = `
query ($id: Int, $page: Int) {
  Staff(id: $id) {
    id
    name { native full }
    image { large }
    characterMedia(sort: START_DATE_DESC, page: $page, perPage: 25) {
      pageInfo { hasNextPage currentPage }
      edges {
        characterRole
        characters { id name { native full } }
        node {
          id type format season seasonYear isAdult
          title { native romaji }
          coverImage { medium }
        }
      }
    }
  }
}`;

/* ---------- batch lookups for the Annict sync ----------
   Chunked ×PER_PAGE with a 700 ms pause between chunks — the live AniList
   limit is ~30 req/min (HANDOFF §6.1). Results are non-positional and misses
   drop silently, so both return a Map keyed by the id that came back. */

const SYNC_STUB_FIELDS = `
  id
  idMal
  title { native romaji }
  season
  seasonYear
`;

const BY_IDS_QUERY = `
query ($ids: [Int]) {
  Page(perPage: ${PER_PAGE}) {
    media(id_in: $ids, type: ANIME) {
      ${SYNC_STUB_FIELDS}
    }
  }
}`;

const BY_MAL_IDS_QUERY = `
query ($ids: [Int]) {
  Page(perPage: ${PER_PAGE}) {
    media(idMal_in: $ids, type: ANIME) {
      ${MEDIA_FIELDS}
    }
  }
}`;

async function chunkedMediaLookup(query, ids, keyOf) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += PER_PAGE) {
    if (i > 0) await new Promise((r) => setTimeout(r, 700));
    const d = await gql(query, { ids: ids.slice(i, i + PER_PAGE) });
    for (const m of d.Page?.media || []) {
      const k = keyOf(m);
      if (k != null) map.set(k, m);
    }
  }
  return map;
}

/* AniList ids → light stubs (idMal + titles + season) for the Annict matcher —
   ledger entries don't snapshot idMal, so sync re-reads it here. */
const fetchMediaByIds = (ids) => chunkedMediaLookup(BY_IDS_QUERY, ids, (m) => m.id);

/* MAL ids → full media (Annict pull sync). Keyed by returned idMal; ids
   AniList doesn't know are simply absent from the Map. */
const fetchMediaByMalIds = (malIds) => chunkedMediaLookup(BY_MAL_IDS_QUERY, malIds, (m) => m.idMal);

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429)
    throw new Error("リクエストが多すぎます。1分ほど待ってから再試行してください。（API rate limit）");
  if (!res.ok) throw new Error(`AniList API error (${res.status})`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || "GraphQL error");
  return json.data;
}

export {
  gql, buildBrowseQuery, buildSearchQuery, DETAIL_QUERY, STAFF_QUERY,
  fetchMediaByIds, fetchMediaByMalIds, PER_PAGE, MAX_AUTO_PAGES,
};
