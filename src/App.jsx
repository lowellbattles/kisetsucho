import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ============================================================
   季節帳 — Seasonal Anime Ledger (v4)
   Data: AniList GraphQL (browsing/cast) + TMDB (JA synopses,
         JP streaming via JustWatch data — attribution required)
   Persistence: window.storage + export/import to JSON
   ============================================================ */

const API = "https://graphql.anilist.co";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const STORE_KEY = "kisetsucho:entries";
const SETTINGS_KEY = "kisetsucho:settings";
const TMDBMAP_KEY = "kisetsucho:tmdbmap";
/* Default TMDB key comes from .env.local via window.KISETSUCHO_ENV (set in main.jsx).
   Must be read lazily inside App: the global is assigned after this module evaluates,
   and import.meta can't be used here — the standalone build (§8) is a non-module script. */
const defaultTmdbKey = () => window.KISETSUCHO_ENV?.tmdbKey || "";
const PER_PAGE = 50;
const MAX_AUTO_PAGES = 12;

const SEASONS = [
  { key: "WINTER", kanji: "冬", months: "1〜3月", en: "Winter", color: "#5B7A99", soft: "#EDF1F5" },
  { key: "SPRING", kanji: "春", months: "4〜6月", en: "Spring", color: "#BC5F7D", soft: "#F8EEF1" },
  { key: "SUMMER", kanji: "夏", months: "7〜9月", en: "Summer", color: "#2E7D6B", soft: "#E9F2EF" },
  { key: "FALL",   kanji: "秋", months: "10〜12月", en: "Autumn", color: "#BE5730", soft: "#F8EFE9" },
];

const SCOPE_TABS = [
  { key: "year",   kanji: "年間", months: "1年分すべて", en: "Full Year", color: "#55597A", soft: "#EDEEF4" },
  { key: "decade", kanji: "年代", months: "10年分すべて", en: "Decade", color: "#715C8C", soft: "#F0EDF5" },
];

const SORTS = [
  { key: "POPULARITY_DESC", ja: "人気順" },
  { key: "SCORE_DESC", ja: "評価順" },
  { key: "START_DATE_DESC", ja: "放送日・新しい順" },
  { key: "START_DATE", ja: "放送日・古い順" },
  { key: "TITLE_NATIVE", ja: "タイトル順" },
];

const FORMATS = [
  { key: "TV", ja: "TVアニメ" },
  { key: "MOVIE", ja: "劇場版" },
  { key: "OVA", ja: "OVA" },
  { key: "ONA", ja: "ONA" },
  { key: "SPECIAL", ja: "スペシャル" },
  { key: "TV_SHORT", ja: "TVショート" },
  { key: "MUSIC", ja: "ミュージック" },
];

const GENRES = [
  { key: "Action", ja: "アクション" },
  { key: "Adventure", ja: "アドベンチャー" },
  { key: "Comedy", ja: "コメディ" },
  { key: "Drama", ja: "ドラマ" },
  { key: "Fantasy", ja: "ファンタジー" },
  { key: "Horror", ja: "ホラー" },
  { key: "Mahou Shoujo", ja: "魔法少女" },
  { key: "Mecha", ja: "メカ" },
  { key: "Music", ja: "音楽" },
  { key: "Mystery", ja: "ミステリー" },
  { key: "Psychological", ja: "心理" },
  { key: "Romance", ja: "恋愛" },
  { key: "Sci-Fi", ja: "SF" },
  { key: "Slice of Life", ja: "日常" },
  { key: "Sports", ja: "スポーツ" },
  { key: "Supernatural", ja: "超自然" },
  { key: "Thriller", ja: "スリラー" },
  { key: "Ecchi", ja: "エッチ" },
];

const STATUSES = [
  { key: "want",     ja: "見たい",  en: "Want to Watch" },
  { key: "watching", ja: "視聴中",  en: "Watching" },
  { key: "watched",  ja: "視聴済",  en: "Watched" },
  { key: "dnf",      ja: "中断",    en: "Did Not Finish" },
];

const FORMAT_JA = {
  TV: "TVアニメ", TV_SHORT: "TVショート", MOVIE: "劇場版", OVA: "OVA",
  ONA: "ONA", SPECIAL: "スペシャル", MUSIC: "ミュージック",
};

const RELATION_JA = {
  SEQUEL: "続編", PREQUEL: "前作", SIDE_STORY: "外伝", PARENT: "本編",
  SPIN_OFF: "スピンオフ", ALTERNATIVE: "別バージョン", SUMMARY: "総集編",
  SOURCE: "原作", ADAPTATION: "アニメ化", CHARACTER: "キャラクター", OTHER: "関連",
};

const ROLE_JA = { MAIN: "主演", SUPPORTING: "脇役", BACKGROUND: "その他" };

const SEASON_ORDER = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };

/* ---------- AniList queries ---------- */

const MEDIA_FIELDS = `
  id
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

/* ---------- misc helpers ---------- */

function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return "WINTER";
  if (m <= 6) return "SPRING";
  if (m <= 9) return "SUMMER";
  return "FALL";
}

function seasonJa(seasonKey, year) {
  const s = SEASONS.find((x) => x.key === seasonKey);
  return s && year ? `${year}年${s.kanji}` : year ? `${year}年` : "";
}

function fmtFuzzyDate(d) {
  if (!d || !d.year) return "";
  let s = `${d.year}年`;
  if (d.month) s += `${d.month}月`;
  if (d.day) s += `${d.day}日`;
  return s;
}

function airDateLine(media) {
  const date = fmtFuzzyDate(media.startDate);
  if (!date) return "";
  const label =
    media.format === "MOVIE" ? "公開" :
    media.format === "OVA" || media.format === "SPECIAL" || media.format === "MUSIC" ? "発売・公開" :
    "放送開始";
  return `${label}：${date}`;
}

function officialLink(media) {
  const links = media.externalLinks || [];
  return (
    links.find((l) => /official/i.test(l.site || "") && (l.language === "Japanese" || !l.language)) ||
    links.find((l) => /official/i.test(l.site || "")) ||
    null
  );
}

function anilistStreamingLinks(media) {
  return (media.externalLinks || [])
    .filter((l) => l.type === "STREAMING")
    .sort((a, b) => ((b.language === "Japanese") ? 1 : 0) - ((a.language === "Japanese") ? 1 : 0));
}

function infoLinks(media) {
  return (media.externalLinks || []).filter(
    (l) => l.type !== "STREAMING" && !/official/i.test(l.site || "")
  ).slice(0, 6);
}

/* ---------- persistence ---------- */

async function storageGetJson(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch {
    return fallback;
  }
}

async function storageSetJson(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value));
  } catch (e) {
    console.error("save failed", e);
  }
}

/* ---------- small components ---------- */

function StarRating({ value, onChange, size = 20 }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="stars" role="radiogroup" aria-label="評価">
      {stars.map((n) => {
        const fill = value >= n ? 1 : value >= n - 0.5 ? 0.5 : 0;
        return (
          <span key={n} className="star-wrap" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
              <defs>
                <linearGradient id={`half-${n}-${size}`}>
                  <stop offset="50%" stopColor="var(--accent)" />
                  <stop offset="50%" stopColor="#D8D5CC" />
                </linearGradient>
              </defs>
              <path
                d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3 6.1 20.5l1.3-6.5L2.5 9.4l6.6-.8z"
                fill={fill === 1 ? "var(--accent)" : fill === 0.5 ? `url(#half-${n}-${size})` : "#D8D5CC"}
              />
            </svg>
            {onChange && (
              <>
                <button className="star-hit left" aria-label={`${n - 0.5}点`} onClick={() => onChange(n - 0.5)} />
                <button className="star-hit right" aria-label={`${n}点`} onClick={() => onChange(n)} />
              </>
            )}
          </span>
        );
      })}
      {value > 0 && <span className="star-num">{value.toFixed(1)}</span>}
    </span>
  );
}

function StatusButtons({ entry, onSet, compact }) {
  return (
    <div className={`status-row${compact ? " compact" : ""}`}>
      {STATUSES.map((s) => {
        const active = entry?.status === s.key;
        return (
          <button
            key={s.key}
            className={`status-btn${active ? " active" : ""}`}
            title={s.en}
            onClick={() => onSet(active ? null : s.key)}
          >
            {s.ja}
          </button>
        );
      })}
    </div>
  );
}

function ProgressControls({ entry, onProgress }) {
  if (!entry || entry.status !== "watching") return null;
  const total = entry.episodes || 0;
  const p = entry.progress || 0;
  const pct = total ? Math.min(100, (p / total) * 100) : 0;
  return (
    <div className="progress-row">
      <button className="mini-btn" aria-label="1話戻す" onClick={() => onProgress(Math.max(0, p - 1))}>−</button>
      <span className="progress-text">{p}{total ? ` / ${total}` : ""}話</span>
      <button
        className="mini-btn"
        aria-label="1話進める"
        onClick={() => onProgress(total ? Math.min(total, p + 1) : p + 1)}
      >＋</button>
      {total > 0 && (
        <span className="progress-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

function WatchedControls({ entry, onRate, onDate, onRewatch }) {
  if (!entry || (entry.status !== "watched" && entry.status !== "dnf")) return null;
  const rw = entry.rewatchCount || 0;
  return (
    <div className="watched-controls">
      {entry.status === "watched" && (
        <StarRating value={entry.rating || 0} onChange={onRate} size={18} />
      )}
      <label className="date-label">
        {entry.status === "watched" ? "完了日" : "中断日"}
        <input type="date" value={entry.completedDate || ""} onChange={(e) => onDate(e.target.value)} />
      </label>
      {entry.status === "watched" && onRewatch && (
        <span className="rewatch">
          再視聴
          <button className="mini-btn" aria-label="再視聴を減らす" onClick={() => onRewatch(Math.max(0, rw - 1))}>−</button>
          <b>{rw}</b>回
          <button className="mini-btn" aria-label="再視聴を増やす" onClick={() => onRewatch(rw + 1)}>＋</button>
        </span>
      )}
    </div>
  );
}

function MemoBox({ entry, onSave }) {
  const [v, setV] = useState(entry?.memo || "");
  useEffect(() => { setV(entry?.memo || ""); }, [entry?.id, entry?.memo]);
  if (!entry) return null;
  return (
    <textarea
      className="memo"
      rows={2}
      placeholder="メモ・感想…"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (entry.memo || "")) onSave(v); }}
    />
  );
}

function AnimeCard({ media, entry, onSet, onRate, onDate, onRewatch, onProgress, onOpen, expandAllSyn }) {
  const [localOpen, setLocalOpen] = useState(null);
  const t = media.title || {};
  const sub = t.english || t.romaji || "";
  const studio = media.studios?.nodes?.[0]?.name;
  const synopsis = stripHtml(media.description);
  const expandable = synopsis.length > 130;
  const expanded = localOpen ?? expandAllSyn;
  const official = officialLink(media);
  const dateLine = airDateLine(media);
  return (
    <article className="card">
      <button className="cover-btn" onClick={() => onOpen(media.id)} aria-label={t.native || sub}>
        {media.coverImage?.large ? (
          <img src={media.coverImage.large} alt="" loading="lazy"
            onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div className="cover-empty">画像なし</div>
        )}
        {entry?.status && (
          <span className="cover-badge">{STATUSES.find((s) => s.key === entry.status)?.ja}</span>
        )}
        {media.isAdult && <span className="adult-badge">R18</span>}
      </button>
      <div className="card-body">
        <h3 className="title-ja" onClick={() => onOpen(media.id)}>{t.native || sub || "（無題）"}</h3>
        {sub && t.native && sub !== t.native && <p className="title-sub">{sub}</p>}
        <p className="meta">
          {FORMAT_JA[media.format] || media.format || ""}
          {media.episodes ? ` ・ 全${media.episodes}話` : ""}
          {studio ? ` ・ ${studio}` : ""}
        </p>
        {dateLine && <p className="meta air-date">{dateLine}</p>}
        {synopsis && (
          <>
            <p className={expanded ? "synopsis full" : "synopsis"}>{synopsis}</p>
            {expandable && (
              <button className="text-link" onClick={() => setLocalOpen(!expanded)}>
                {expanded ? "閉じる" : "続きを読む"}
              </button>
            )}
          </>
        )}
        {(official || media.siteUrl) && (
          <p className="card-links">
            {official && <a href={official.url} target="_blank" rel="noreferrer">公式サイト ↗</a>}
            {media.siteUrl && <a href={media.siteUrl} target="_blank" rel="noreferrer">AniList ↗</a>}
          </p>
        )}
        <StatusButtons entry={entry} onSet={onSet} compact />
        <ProgressControls entry={entry} onProgress={onProgress} />
        <WatchedControls entry={entry} onRate={onRate} onDate={onDate} onRewatch={onRewatch} />
      </div>
    </article>
  );
}

/* ---------- TMDB section inside the detail modal ---------- */

function TmdbSection({ media, tmdbKey, mapEntry, onMap, anilistDescription, anilistStreams }) {
  const [state, setState] = useState({ loading: false });
  const [fixOpen, setFixOpen] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [showEn, setShowEn] = useState(false);

  useEffect(() => {
    if (!media || !tmdbKey) { setState({ nokey: true }); return; }
    let live = true;
    (async () => {
      setState({ loading: true });
      setShowEn(false);
      try {
        let m = mapEntry;
        if (!m) {
          const cands = await tmdbFindCandidates(media, tmdbKey);
          if (live) setCandidates(cands);
          m = cands[0] ? { id: cands[0].id, type: cands[0].type } : { none: true };
          onMap(media.id, m);
          return; // effect re-runs with the stored mapping
        }
        if (m.none) { if (live) setState({ none: true }); return; }
        const info = await tmdbDetails(m, tmdbKey);
        if (live) setState({ info });
      } catch (e) {
        if (live) setState({ error: e.message });
      }
    })();
    return () => { live = false; };
  }, [media?.id, tmdbKey, mapEntry?.id, mapEntry?.none]);

  const openFix = async () => {
    setFixOpen(!fixOpen);
    if (!candidates && tmdbKey && media) {
      try { setCandidates(await tmdbFindCandidates(media, tmdbKey)); }
      catch { setCandidates([]); }
    }
  };

  const en = stripHtml(anilistDescription);
  const info = state.info;
  const ja = info?.overview || "";
  const jp = info?.jp;
  const providerGroups = jp
    ? [["見放題", jp.flatrate], ["レンタル", jp.rent], ["購入", jp.buy]].filter(([, l]) => l?.length)
    : [];

  return (
    <>
      <section className="modal-section">
        <h4>
          あらすじ{" "}
          <span className="en-hint">
            {ja ? "Synopsis（日本語・TMDB）" : "Synopsis（英語・AniList）"}
          </span>
        </h4>
        {state.loading && <p className="fine">TMDBを照会中…</p>}
        {state.error && <p className="fine">TMDB照会エラー：{state.error}</p>}
        {ja ? (
          <>
            <p className="synopsis full">{ja}</p>
            {en && (
              <>
                <button className="text-link" onClick={() => setShowEn(!showEn)}>
                  {showEn ? "英語のあらすじを隠す" : "英語のあらすじも表示（AniList）"}
                </button>
                {showEn && <p className="synopsis full en-syn">{en}</p>}
              </>
            )}
          </>
        ) : (
          <>
            {en ? <p className="synopsis full">{en}</p> : <p className="fine">あらすじはありません。</p>}
            {!state.loading && !state.nokey && (
              <p className="fine">
                {state.none
                  ? "TMDBで該当作品が見つからなかったため、日本語あらすじは表示できません。"
                  : info && !ja
                  ? "TMDBに日本語のあらすじが登録されていない作品です。"
                  : null}
              </p>
            )}
          </>
        )}
        {tmdbKey && !state.loading && (
          <button className="text-link" onClick={openFix}>
            {fixOpen ? "候補を閉じる" : "TMDBの照合を修正する"}
          </button>
        )}
        {fixOpen && (
          <div className="candidate-list">
            {candidates === null && <p className="fine">候補を取得中…</p>}
            {candidates?.length === 0 && <p className="fine">候補が見つかりませんでした。</p>}
            {candidates?.map((c) => (
              <button
                key={`${c.type}-${c.id}`}
                className={`candidate${mapEntry?.id === c.id ? " active" : ""}`}
                onClick={() => { onMap(media.id, { id: c.id, type: c.type }); setFixOpen(false); }}
              >
                {c.name}{c.year ? `（${c.year}）` : ""} <span className="fine">{c.type === "movie" ? "映画" : "TV"}</span>
              </button>
            ))}
            <button className="candidate" onClick={() => { onMap(media.id, { none: true }); setFixOpen(false); }}>
              該当なしにする
            </button>
          </div>
        )}
      </section>

      <section className="modal-section">
        <h4>配信（日本） <span className="en-hint">Where to Watch in Japan</span></h4>
        {providerGroups.length > 0 ? (
          <>
            {providerGroups.map(([label, list]) => (
              <div key={label} className="provider-group">
                <span className="provider-label">{label}</span>
                <div className="link-chips">
                  {list.map((p) => (
                    <a key={p.provider_id} className="chip-link provider-chip"
                      href={jp.link} target="_blank" rel="noreferrer">
                      {p.logo_path && (
                        <img src={`${TMDB_IMG}/w45${p.logo_path}`} alt="" loading="lazy" />
                      )}
                      {p.provider_name}
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <p className="fine">
              配信情報：<a href={jp.link} target="_blank" rel="noreferrer">JustWatch</a> 提供（TMDB経由）
              {info?.tmdbUrl && <> ・ <a href={info.tmdbUrl} target="_blank" rel="noreferrer">TMDBで見る ↗</a></>}
            </p>
          </>
        ) : (
          <>
            {state.loading && <p className="fine">取得中…</p>}
            {!state.loading && (
              <p className="fine">
                {state.nokey
                  ? "TMDB APIキーを設定すると、日本国内の配信情報が表示されます（⚙ 設定）。"
                  : "日本国内の配信情報が見つかりませんでした。"}
              </p>
            )}
            {anilistStreams.length > 0 && (
              <div className="link-chips" style={{ marginTop: 8 }}>
                {anilistStreams.map((l, i) => (
                  <a key={i} className="chip-link" href={l.url} target="_blank" rel="noreferrer">
                    {l.site}{l.language && l.language !== "Japanese" ? `（${l.language}）` : ""} ↗
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

/* ---------- seiyuu (voice actor) modal ---------- */

function SeiyuuModal({ id, showAdult, onClose, onOpenWork }) {
  const [staff, setStaff] = useState(null);
  const [edges, setEdges] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const fetchPage = useCallback(async (p, append) => {
    setLoading(true);
    setErr(null);
    try {
      const d = await gql(STAFF_QUERY, { id, page: p });
      const s = d.Staff;
      setStaff({ name: s.name, image: s.image });
      setEdges((prev) => (append ? [...prev, ...s.characterMedia.edges] : s.characterMedia.edges));
      setHasNext(s.characterMedia.pageInfo.hasNextPage);
      setPage(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setEdges([]); setStaff(null); fetchPage(1, false); }, [id, fetchPage]);

  const visible = edges.filter((e) => e.node && (showAdult || !e.node.isAdult));

  return (
    <div className="overlay seiyuu-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        {err && <p className="error-inline">読み込みに失敗しました — {err}</p>}
        {!staff && !err && <p className="loading-inline">読み込み中…</p>}
        {staff && (
          <>
            <div className="seiyuu-head">
              {staff.image?.large && (
                <img className="seiyuu-photo" src={staff.image.large} alt=""
                  onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <div>
                <p className="eyebrow">声優 ・ Voice Actor</p>
                <h2 className="modal-title">{staff.name?.native || staff.name?.full}</h2>
                {staff.name?.native && staff.name?.full && staff.name.full !== staff.name.native && (
                  <p className="title-sub big">{staff.name.full}</p>
                )}
              </div>
            </div>
            <section className="modal-section">
              <h4>出演作品 <span className="en-hint">Roles — newest first</span></h4>
              <ul className="relation-list">
                {visible.map((e, i) => {
                  const ch = e.characters?.[0];
                  return (
                    <li key={`${e.node.id}-${ch?.id || i}`}>
                      <button className="relation-item" onClick={() => onOpenWork(e.node.id)}>
                        {e.node.coverImage?.medium && (
                          <img src={e.node.coverImage.medium} alt="" loading="lazy"
                            onError={(ev) => { ev.target.style.display = "none"; }} />
                        )}
                        <span className="relation-tag">{ROLE_JA[e.characterRole] || "出演"}</span>
                        <span className="relation-title">
                          {ch?.name?.native || ch?.name?.full || ""}
                          {ch ? " — " : ""}
                          {e.node.title?.native || e.node.title?.romaji}
                          {e.node.seasonYear ? `（${seasonJa(e.node.season, e.node.seasonYear)}）` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {loading && <p className="loading-inline">読み込み中…</p>}
              {hasNext && !loading && (
                <button className="load-more" onClick={() => fetchPage(page + 1, true)}>もっと見る</button>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- detail modal ---------- */

function DetailModal({
  id, entry, tmdbKey, tmdbMap, onMap, showAdult,
  onClose, onSet, onRate, onDate, onRewatch, onProgress, onMemo, onOpen, onOpenSeiyuu,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    gql(DETAIL_QUERY, { id })
      .then((d) => live && setData(d.Media))
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [id]);

  const t = data?.title || {};
  const relations = (data?.relations?.edges || []).filter((e) => e.node?.type === "ANIME");
  const official = data ? officialLink(data) : null;
  const others = data ? infoLinks(data) : [];
  const dateLine = data ? airDateLine(data) : "";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        {err && <p className="error-inline">読み込みに失敗しました — {err}</p>}
        {!data && !err && <p className="loading-inline">読み込み中…</p>}
        {data && (
          <>
            <div className="modal-head">
              {data.coverImage?.large && (
                <img className="modal-cover" src={data.coverImage.large} alt=""
                  onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <div className="modal-headtext">
                <p className="eyebrow">
                  {seasonJa(data.season, data.seasonYear)}
                  {data.format ? ` ・ ${FORMAT_JA[data.format] || data.format}` : ""}
                  {data.episodes ? ` ・ 全${data.episodes}話` : ""}
                  {data.isAdult ? " ・ R18" : ""}
                </p>
                <h2 className="modal-title">{t.native || t.romaji}</h2>
                {(t.english || t.romaji) && <p className="title-sub big">{t.english || t.romaji}</p>}
                {dateLine && <p className="meta">{dateLine}</p>}
                {data.studios?.nodes?.length > 0 && (
                  <p className="meta">制作：{data.studios.nodes.map((s) => s.name).join("、")}</p>
                )}
                {data.genres?.length > 0 && (
                  <p className="genres">
                    {data.genres.map((g) => GENRES.find((x) => x.key === g)?.ja || g).join(" / ")}
                  </p>
                )}
                <StatusButtons entry={entry} onSet={onSet} />
                <ProgressControls entry={entry} onProgress={onProgress} />
                <WatchedControls entry={entry} onRate={onRate} onDate={onDate} onRewatch={onRewatch} />
                {entry && <MemoBox entry={entry} onSave={onMemo} />}
              </div>
            </div>

            {(official || data.siteUrl || others.length > 0) && (
              <section className="modal-section">
                <h4>リンク <span className="en-hint">Links</span></h4>
                <div className="link-chips">
                  {official && (
                    <a className="chip-link primary" href={official.url} target="_blank" rel="noreferrer">
                      公式サイト ↗
                    </a>
                  )}
                  {data.siteUrl && (
                    <a className="chip-link" href={data.siteUrl} target="_blank" rel="noreferrer">
                      AniList ↗
                    </a>
                  )}
                  {others.map((l, i) => (
                    <a key={i} className="chip-link" href={l.url} target="_blank" rel="noreferrer">
                      {l.site} ↗
                    </a>
                  ))}
                </div>
              </section>
            )}

            <TmdbSection
              media={data}
              tmdbKey={tmdbKey}
              mapEntry={tmdbMap[data.id]}
              onMap={onMap}
              anilistDescription={data.description}
              anilistStreams={anilistStreamingLinks(data)}
            />

            {data.characters?.edges?.length > 0 && (
              <section className="modal-section">
                <h4>キャラクター・声優 <span className="en-hint">Characters &amp; Cast — 声優名をクリックで出演作品へ</span></h4>
                <ul className="cast-grid">
                  {data.characters.edges.map((e, i) => {
                    const c = e.node;
                    const va = e.voiceActors?.[0];
                    return (
                      <li key={c.id || i} className="cast-item">
                        {c.image?.medium && (
                          <img src={c.image.medium} alt="" loading="lazy"
                            onError={(ev) => { ev.target.style.display = "none"; }} />
                        )}
                        <div>
                          <p className="cast-name">{c.name?.native || c.name?.full}</p>
                          {c.name?.native && c.name?.full && c.name.full !== c.name.native && (
                            <p className="cast-sub">{c.name.full}</p>
                          )}
                          {va && (
                            <button className="cast-va-link" onClick={() => onOpenSeiyuu(va.id)}>
                              CV: {va.name?.native || va.name?.full}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {relations.length > 0 && (
              <section className="modal-section">
                <h4>関連作品 <span className="en-hint">Related — sequels, prequels &amp; spin-offs</span></h4>
                <ul className="relation-list">
                  {relations.map((e, i) => (
                    <li key={i}>
                      <button className="relation-item" onClick={() => onOpen(e.node.id)}>
                        {e.node.coverImage?.medium && (
                          <img src={e.node.coverImage.medium} alt="" loading="lazy"
                            onError={(ev) => { ev.target.style.display = "none"; }} />
                        )}
                        <span className="relation-tag">{RELATION_JA[e.relationType] || e.relationType}</span>
                        <span className="relation-title">
                          {e.node.title?.native || e.node.title?.romaji}
                          {e.node.seasonYear ? `（${seasonJa(e.node.season, e.node.seasonYear)}）` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- settings modal ---------- */

function SettingsModal({ settings, onSave, onClose }) {
  const [key, setKey] = useState(settings.tmdbKey || "");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        <h2 className="modal-title">設定 <span className="en-hint">Settings</span></h2>
        <section className="modal-section">
          <h4>TMDB APIキー</h4>
          <p className="fine">
            日本語のあらすじと日本国内の配信情報（JustWatch提供・TMDB経由）の取得に使用します。
            キーは themoviedb.org の「設定 → API」で取得できます。この端末のブラウザにのみ保存されます。
          </p>
          <input
            className="settings-input"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="TMDB API Key"
            autoComplete="off"
          />
        </section>
        <div className="settings-actions">
          <button className="toolbar-btn on" onClick={() => { onSave({ ...settings, tmdbKey: key.trim() }); onClose(); }}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- stats view ---------- */

function BarRow({ label, value, max, suffix }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${pct}%` }} /></span>
      <span className="bar-val">{value}{suffix || ""}</span>
    </div>
  );
}

function StatsView({ entries }) {
  const stats = useMemo(() => {
    const all = Object.values(entries);
    const watched = all.filter((e) => e.status === "watched");
    const rated = watched.filter((e) => e.rating > 0);
    const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;
    const rewatches = watched.reduce((s, e) => s + (e.rewatchCount || 0), 0);

    const byAirYear = {};
    const byCompYear = {};
    const byFormat = {};
    const ratingDist = {};
    const bySeason = { WINTER: { n: 0, sum: 0 }, SPRING: { n: 0, sum: 0 }, SUMMER: { n: 0, sum: 0 }, FALL: { n: 0, sum: 0 } };

    watched.forEach((e) => {
      if (e.seasonYear) byAirYear[e.seasonYear] = (byAirYear[e.seasonYear] || 0) + 1;
      if (e.completedDate) {
        const y = e.completedDate.slice(0, 4);
        byCompYear[y] = (byCompYear[y] || 0) + 1;
      }
      if (e.format) byFormat[e.format] = (byFormat[e.format] || 0) + 1;
      if (e.rating > 0) {
        const k = e.rating.toFixed(1);
        ratingDist[k] = (ratingDist[k] || 0) + 1;
        if (bySeason[e.season]) { bySeason[e.season].n += 1; bySeason[e.season].sum += e.rating; }
      }
    });

    return { all, watched, rated, avg, rewatches, byAirYear, byCompYear, byFormat, ratingDist, bySeason };
  }, [entries]);

  const counts = useMemo(() => {
    const c = { want: 0, watching: 0, watched: 0, dnf: 0 };
    Object.values(entries).forEach((e) => { if (c[e.status] !== undefined) c[e.status]++; });
    return c;
  }, [entries]);

  const airYears = Object.keys(stats.byAirYear).sort();
  const compYears = Object.keys(stats.byCompYear).sort();
  const maxAir = Math.max(0, ...Object.values(stats.byAirYear));
  const maxComp = Math.max(0, ...Object.values(stats.byCompYear));
  const maxFmt = Math.max(0, ...Object.values(stats.byFormat));
  const ratingKeys = ["0.5","1.0","1.5","2.0","2.5","3.0","3.5","4.0","4.5","5.0"];
  const maxDist = Math.max(0, ...ratingKeys.map((k) => stats.ratingDist[k] || 0));

  if (stats.all.length === 0) {
    return (
      <main className="grid-wrap">
        <p className="empty">
          まだ記録がありません。作品を記録すると、ここに統計が表示されます。
        </p>
      </main>
    );
  }

  return (
    <main className="grid-wrap stats-wrap">
      <section className="stat-section">
        <h3 className="group-header">概要 <span className="group-count">Overview</span></h3>
        <div className="stat-cards">
          {STATUSES.map((s) => (
            <div key={s.key} className="stat-card">
              <span className="stat-num">{counts[s.key]}</span>
              <span className="stat-label">{s.ja}</span>
            </div>
          ))}
          <div className="stat-card">
            <span className="stat-num">{stats.avg ? `★${stats.avg.toFixed(2)}` : "–"}</span>
            <span className="stat-label">平均評価（{stats.rated.length}件）</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">{stats.rewatches}</span>
            <span className="stat-label">再視聴の合計</span>
          </div>
        </div>
      </section>

      {airYears.length > 0 && (
        <section className="stat-section">
          <h3 className="group-header">放送年別・視聴数 <span className="group-count">Watched by air year</span></h3>
          {airYears.map((y) => (
            <BarRow key={y} label={`${y}年`} value={stats.byAirYear[y]} max={maxAir} suffix="本" />
          ))}
        </section>
      )}

      {compYears.length > 0 && (
        <section className="stat-section">
          <h3 className="group-header">完了年別・視聴数 <span className="group-count">Watched by completion year</span></h3>
          {compYears.map((y) => (
            <BarRow key={y} label={`${y}年`} value={stats.byCompYear[y]} max={maxComp} suffix="本" />
          ))}
        </section>
      )}

      <section className="stat-section">
        <h3 className="group-header">季節別・平均評価 <span className="group-count">Average rating by season</span></h3>
        <div className="season-stat-row">
          {SEASONS.map((s) => {
            const d = stats.bySeason[s.key];
            const avg = d.n ? d.sum / d.n : 0;
            return (
              <div key={s.key} className="season-stat" style={{ "--tab-color": s.color, "--tab-soft": s.soft }}>
                <span className="season-kanji small">{s.kanji}</span>
                <span className="stat-num small">{d.n ? `★${avg.toFixed(2)}` : "–"}</span>
                <span className="stat-label">{d.n}件</span>
              </div>
            );
          })}
        </div>
      </section>

      {Object.keys(stats.byFormat).length > 0 && (
        <section className="stat-section">
          <h3 className="group-header">フォーマット別 <span className="group-count">By format</span></h3>
          {Object.entries(stats.byFormat)
            .sort((a, b) => b[1] - a[1])
            .map(([f, n]) => (
              <BarRow key={f} label={FORMAT_JA[f] || f} value={n} max={maxFmt} suffix="本" />
            ))}
        </section>
      )}

      {stats.rated.length > 0 && (
        <section className="stat-section">
          <h3 className="group-header">評価分布 <span className="group-count">Rating distribution</span></h3>
          {ratingKeys.map((k) => (
            <BarRow key={k} label={`★${k}`} value={stats.ratingDist[k] || 0} max={maxDist} suffix="件" />
          ))}
        </section>
      )}
    </main>
  );
}

/* ---------- main app ---------- */

export default function App() {
  const now = new Date();
  const [view, setView] = useState("browse"); // browse | search | list | stats
  const [scope, setScope] = useState("season");
  const [year, setYear] = useState(now.getFullYear());
  const [season, setSeason] = useState(currentSeason());
  const [decade, setDecade] = useState(Math.floor(now.getFullYear() / 10) * 10);
  const [sort, setSort] = useState("POPULARITY_DESC");
  const [formats, setFormats] = useState([]);
  const [genres, setGenres] = useState([]);
  const [showAdult, setShowAdult] = useState(false);
  const [results, setResults] = useState([]);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const autoRef = useRef(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [expandAllSyn, setExpandAllSyn] = useState(false);
  const [entries, setEntries] = useState({});
  const [ready, setReady] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [seiyuuId, setSeiyuuId] = useState(null);
  const [listTab, setListTab] = useState("watched");
  const [ledgerSort, setLedgerSort] = useState("date");
  const [ioMsg, setIoMsg] = useState(null);
  const fileRef = useRef(null);
  const [settings, setSettings] = useState(() => ({ tmdbKey: defaultTmdbKey() }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tmdbMap, setTmdbMap] = useState({});

  const seasonMeta = SEASONS.find((s) => s.key === season);
  const scopeMeta = SCOPE_TABS.find((s) => s.key === scope);
  const browsing = view === "browse" || view === "search";
  const accent = !browsing ? "#3A3D46" : scope === "season" ? seasonMeta.color : scopeMeta.color;
  const accentSoft = !browsing ? "#ECEBE6" : scope === "season" ? seasonMeta.soft : scopeMeta.soft;

  useEffect(() => {
    (async () => {
      const [e, s, m] = await Promise.all([
        storageGetJson(STORE_KEY, {}),
        storageGetJson(SETTINGS_KEY, null),
        storageGetJson(TMDBMAP_KEY, {}),
      ]);
      setEntries(e);
      if (s) setSettings((prev) => ({ ...prev, ...s }));
      setTmdbMap(m);
      setReady(true);
    })();
  }, []);

  const saveSettings = (s) => { setSettings(s); storageSetJson(SETTINGS_KEY, s); };
  const updateTmdbMap = (anilistId, val) =>
    setTmdbMap((prev) => {
      const next = { ...prev, [anilistId]: val };
      storageSetJson(TMDBMAP_KEY, next);
      return next;
    });

  const currentQueryVars = useCallback(() => {
    const hideAdult = !showAdult;
    if (view === "search")
      return { q: buildSearchQuery({ hideAdult }), vars: { q: query.trim() } };
    const useFormats = formats.length > 0;
    const useGenres = genres.length > 0;
    const opts = { useFormats, useGenres, hideAdult };
    const extra = {
      ...(useFormats ? { formats } : {}),
      ...(useGenres ? { genres } : {}),
    };
    if (scope === "season")
      return { q: buildBrowseQuery("season", opts), vars: { season, year, sort: [sort], ...extra } };
    if (scope === "year")
      return { q: buildBrowseQuery("year", opts), vars: { year, sort: [sort], ...extra } };
    return {
      q: buildBrowseQuery("decade", opts),
      vars: { after: decade * 10000, before: (decade + 10) * 10000, sort: [sort], ...extra },
    };
  }, [view, scope, season, year, decade, sort, query, formats, genres, showAdult]);

  const fetchPage = useCallback(async (p, append) => {
    setLoading(true);
    setError(null);
    if (!append) setNotice(null);
    try {
      const { q, vars } = currentQueryVars();
      const d = await gql(q, { ...vars, page: p });
      setResults((prev) => (append ? [...prev, ...d.Page.media] : d.Page.media));
      setHasNext(d.Page.pageInfo.hasNextPage);
      setPage(p);
    } catch (e) {
      setError(e.message);
      if (!append) setResults([]);
    } finally {
      setLoading(false);
    }
  }, [currentQueryVars]);

  useEffect(() => {
    if (view === "browse") {
      autoRef.current = false;
      setAutoLoading(false);
      fetchPage(1, false);
    }
  }, [view, scope, year, season, decade, sort, formats, genres, showAdult]); // eslint-disable-line

  const runSearch = () => {
    if (!query.trim()) return;
    autoRef.current = false;
    setAutoLoading(false);
    if (view === "search") fetchPage(1, false);
    else setView("search");
  };

  useEffect(() => {
    if (view === "search") fetchPage(1, false);
  }, [view, showAdult]); // eslint-disable-line

  const loadAll = async () => {
    if (autoLoading) { autoRef.current = false; setAutoLoading(false); return; }
    setAutoLoading(true);
    autoRef.current = true;
    setNotice(null);
    let p = page;
    let more = hasNext;
    try {
      const { q, vars } = currentQueryVars();
      while (more && p < MAX_AUTO_PAGES && autoRef.current) {
        const d = await gql(q, { ...vars, page: p + 1 });
        setResults((prev) => [...prev, ...d.Page.media]);
        p += 1;
        more = d.Page.pageInfo.hasNextPage;
        setPage(p);
        setHasNext(more);
        if (more && autoRef.current) await new Promise((r) => setTimeout(r, 700));
      }
      if (more && p >= MAX_AUTO_PAGES) {
        setNotice(`一度に読み込めるのは約${MAX_AUTO_PAGES * PER_PAGE}件までです（APIの制限のため）。並び替えやフォーマット・ジャンル絞り込みで対象を減らせます。`);
      }
    } catch (e) {
      setError(e.message);
    }
    setAutoLoading(false);
    autoRef.current = false;
  };

  /* entry mutations */
  const mutate = (media, fn) => {
    setEntries((prev) => {
      const cur = prev[media.id];
      const next = { ...prev };
      const updated = fn(cur);
      if (updated === null) delete next[media.id];
      else {
        next[media.id] = {
          id: media.id,
          title: media.title,
          cover: media.coverImage?.large || media.cover,
          format: media.format,
          season: media.season,
          seasonYear: media.seasonYear,
          episodes: media.episodes,
          ...cur,
          ...updated,
          updatedAt: Date.now(),
        };
      }
      storageSetJson(STORE_KEY, next);
      return next;
    });
  };

  const setStatus = (media) => (status) =>
    mutate(media, (cur) => {
      if (status === null) return null;
      const upd = { status };
      if ((status === "watched" || status === "dnf") && !cur?.completedDate)
        upd.completedDate = today();
      if (status === "watched" && media.episodes) upd.progress = media.episodes;
      return upd;
    });

  const setRating = (media) => (rating) => mutate(media, () => ({ rating }));
  const setDate = (media) => (completedDate) => mutate(media, () => ({ completedDate }));
  const setMemo = (media) => (memo) => mutate(media, () => ({ memo }));
  const setProgress = (media) => (progress) => mutate(media, () => ({ progress }));
  const setRewatch = (media) => (rewatchCount) => mutate(media, () => ({ rewatchCount }));

  /* export / import */
  const exportLedger = () => {
    const payload = { app: "kisetsucho", version: 4, exportedAt: new Date().toISOString(), entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kisetsucho-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setIoMsg("エクスポートしました");
  };

  const importLedger = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const imported = data.entries || data;
        if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error();
        const n = Object.keys(imported).length;
        setEntries((prev) => {
          const merged = { ...prev, ...imported };
          storageSetJson(STORE_KEY, merged);
          return merged;
        });
        setIoMsg(`${n}件をインポートしました（同じ作品は上書き）`);
      } catch {
        setIoMsg("ファイルを読み込めませんでした。エクスポートしたJSONを選んでください。");
      }
    };
    r.readAsText(file);
  };

  /* random pick from 見たい */
  const randomPick = () => {
    const wants = Object.values(entries).filter((e) => e.status === "want");
    if (!wants.length) { setIoMsg("「見たい」リストが空です。"); return; }
    const pick = wants[Math.floor(Math.random() * wants.length)];
    setDetailId(pick.id);
  };

  /* derived */
  const decadeYears = useMemo(() => {
    const ys = [];
    const max = Math.min(decade + 9, now.getFullYear() + 1);
    for (let y = decade; y <= max; y++) ys.push(y);
    return ys;
  }, [decade]);

  const decades = useMemo(() => {
    const ds = [];
    for (let d = 1960; d <= Math.floor((now.getFullYear() + 1) / 10) * 10; d += 10) ds.push(d);
    return ds;
  }, []);

  const listEntries = useMemo(() => {
    const arr = Object.values(entries).filter((e) => e.status === listTab);
    const bySeason = (a, b) =>
      (b.seasonYear || 0) - (a.seasonYear || 0) ||
      (SEASON_ORDER[b.season] ?? -1) - (SEASON_ORDER[a.season] ?? -1);
    const sorters = {
      date: (a, b) =>
        (b.completedDate || "").localeCompare(a.completedDate || "") || b.updatedAt - a.updatedAt,
      season: bySeason,
      season_asc: (a, b) => -bySeason(a, b),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      title: (a, b) =>
        (a.title?.native || a.title?.romaji || "").localeCompare(
          b.title?.native || b.title?.romaji || "", "ja"),
    };
    return arr.sort(sorters[ledgerSort] || sorters.date);
  }, [entries, listTab, ledgerSort]);

  const groupedEntries = useMemo(() => {
    const keyFns = {
      date: (e) => {
        if (!e.completedDate) return "日付なし";
        const [y, m] = e.completedDate.split("-");
        return `${y}年${parseInt(m, 10)}月`;
      },
      season: (e) => (e.seasonYear ? seasonJa(e.season, e.seasonYear) : "シーズン不明"),
      season_asc: (e) => (e.seasonYear ? seasonJa(e.season, e.seasonYear) : "シーズン不明"),
      rating: (e) => (e.rating ? `★ ${e.rating.toFixed(1)}` : "未評価"),
      title: null,
    };
    const keyFn = keyFns[ledgerSort];
    if (!keyFn) return [{ header: null, items: listEntries }];
    const groups = [];
    for (const e of listEntries) {
      const k = keyFn(e);
      if (!groups.length || groups[groups.length - 1].header !== k)
        groups.push({ header: k, items: [] });
      groups[groups.length - 1].items.push(e);
    }
    return groups;
  }, [listEntries, ledgerSort]);

  const counts = useMemo(() => {
    const c = { want: 0, watching: 0, watched: 0, dnf: 0 };
    Object.values(entries).forEach((e) => { if (c[e.status] !== undefined) c[e.status]++; });
    return c;
  }, [entries]);

  const watchedStats = useMemo(() => {
    const watched = Object.values(entries).filter((e) => e.status === "watched");
    const rated = watched.filter((e) => e.rating > 0);
    const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;
    return { total: watched.length, rated: rated.length, avg };
  }, [entries]);

  const stubFromEntry = (e) => ({
    id: e.id, title: e.title, coverImage: { large: e.cover },
    format: e.format, season: e.season, seasonYear: e.seasonYear, episodes: e.episodes,
  });

  const detailMedia = () =>
    results.find((r) => r.id === detailId) ||
    (entries[detailId] ? stubFromEntry(entries[detailId]) : { id: detailId, title: {} });

  const toggleIn = (setter) => (k) =>
    setter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const toggleFormat = toggleIn(setFormats);
  const toggleGenre = toggleIn(setGenres);

  const pageTitle =
    view === "search" ? <>検索結果 <span className="page-title-sub">“{query}”</span></> :
    scope === "season" ? <>{year}年{seasonMeta.kanji}アニメ <span className="page-title-sub">{seasonMeta.en} {year}</span></> :
    scope === "year" ? <>{year}年のアニメ <span className="page-title-sub">All of {year}</span></> :
    <>{decade}年代のアニメ <span className="page-title-sub">The {decade}s</span></>;

  return (
    <div className="app" style={{ "--accent": accent, "--accent-soft": accentSoft }}>
      <style>{CSS}</style>

      <header className="header">
        <div className="brand" onClick={() => setView("browse")}>
          <span className="brand-kanji">季節帳</span>
          <span className="brand-sub">Seasonal Anime Ledger</span>
        </div>
        <form className="search" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="作品名で検索（日本語・英語）"
            aria-label="検索"
          />
          <button type="submit">検索</button>
        </form>
        <nav className="nav">
          <button className={browsing ? "active" : ""} onClick={() => setView("browse")}>
            さがす<span className="nav-en">Browse</span>
          </button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
            記録<span className="nav-en">My Ledger</span>
          </button>
          <button className={view === "stats" ? "active" : ""} onClick={() => setView("stats")}>
            統計<span className="nav-en">Stats</span>
          </button>
          <button className="gear" onClick={() => setSettingsOpen(true)} title="設定" aria-label="設定">⚙</button>
        </nav>
      </header>

      {browsing && (
        <section className="season-nav">
          <div className="decade-year-row">
            <select
              value={decade}
              onChange={(e) => {
                const d = Number(e.target.value);
                setDecade(d);
                setYear(Math.min(Math.max(year, d), d + 9));
                setView("browse");
              }}
              aria-label="年代"
            >
              {decades.map((d) => (
                <option key={d} value={d}>{d}年代</option>
              ))}
            </select>
            <div className={`year-chips${scope === "decade" ? " dim" : ""}`}>
              {decadeYears.map((y) => (
                <button
                  key={y}
                  className={y === year && view === "browse" && scope !== "decade" ? "chip active" : "chip"}
                  onClick={() => {
                    setYear(y);
                    if (scope === "decade") setScope("season");
                    setView("browse");
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="season-tabs">
            {SEASONS.map((s) => (
              <button
                key={s.key}
                className={s.key === season && scope === "season" && view === "browse" ? "season-tab active" : "season-tab"}
                style={{ "--tab-color": s.color, "--tab-soft": s.soft }}
                onClick={() => { setSeason(s.key); setScope("season"); setView("browse"); }}
              >
                <span className="season-kanji">{s.kanji}</span>
                <span className="season-months">{s.months}</span>
              </button>
            ))}
            <span className="tab-divider" aria-hidden="true" />
            {SCOPE_TABS.map((s) => (
              <button
                key={s.key}
                className={scope === s.key && view === "browse" ? "season-tab active" : "season-tab"}
                style={{ "--tab-color": s.color, "--tab-soft": s.soft }}
                onClick={() => { setScope(s.key); setView("browse"); }}
              >
                <span className="season-kanji small">{s.kanji}</span>
                <span className="season-months">{s.months}</span>
              </button>
            ))}
          </div>
          <h1 className="page-title">{pageTitle}</h1>

          <div className="toolbar">
            {view === "browse" && (
              <label className="sort-label">
                並び替え
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.ja}</option>
                  ))}
                </select>
              </label>
            )}
            {hasNext && (
              <button className="toolbar-btn" onClick={loadAll}>
                {autoLoading ? "読み込みを停止" : "すべて表示"}
              </button>
            )}
            <button
              className={`toolbar-btn${expandAllSyn ? " on" : ""}`}
              onClick={() => setExpandAllSyn(!expandAllSyn)}
            >
              {expandAllSyn ? "あらすじを折りたたむ" : "あらすじを全文表示"}
            </button>
            <button
              className={`toolbar-btn subtle${showAdult ? " on" : ""}`}
              onClick={() => setShowAdult(!showAdult)}
              title="18歳以上向け作品の表示切替"
            >
              {showAdult ? "R18作品を隠す" : "R18作品を表示"}
            </button>
            {results.length > 0 && (
              <span className="result-count">{results.length}件{hasNext ? "＋" : ""}表示中</span>
            )}
          </div>

          {view === "browse" && (
            <>
              <div className="format-row">
                <span className="format-label">フォーマット</span>
                <button className={formats.length === 0 ? "chip active" : "chip"} onClick={() => setFormats([])}>
                  すべて
                </button>
                {FORMATS.map((f) => (
                  <button key={f.key} className={formats.includes(f.key) ? "chip active" : "chip"}
                    onClick={() => toggleFormat(f.key)}>
                    {f.ja}
                  </button>
                ))}
              </div>
              <div className="format-row">
                <span className="format-label">ジャンル</span>
                <button className={genres.length === 0 ? "chip active" : "chip"} onClick={() => setGenres([])}>
                  すべて
                </button>
                {GENRES.map((g) => (
                  <button key={g.key} className={genres.includes(g.key) ? "chip active" : "chip"}
                    onClick={() => toggleGenre(g.key)}>
                    {g.ja}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {error && (
        <div className="error-banner">
          <strong>データを取得できませんでした。</strong> {error}
          <br />
          <span className="error-hint">
            AniList API（graphql.anilist.co）への接続が必要です。この環境で外部通信がブロックされている場合は、
            このファイルをローカルで実行してください。
          </span>
        </div>
      )}
      {notice && <div className="notice-banner">{notice}</div>}

      {browsing && (
        <main className="grid-wrap">
          {loading && results.length === 0 && <p className="loading-inline">読み込み中…</p>}
          {!loading && !error && results.length === 0 && (
            <p className="empty">作品が見つかりませんでした。</p>
          )}
          <div className="grid">
            {results.map((m) => (
              <AnimeCard
                key={m.id}
                media={m}
                entry={entries[m.id]}
                onSet={setStatus(m)}
                onRate={setRating(m)}
                onDate={setDate(m)}
                onRewatch={setRewatch(m)}
                onProgress={setProgress(m)}
                onOpen={setDetailId}
                expandAllSyn={expandAllSyn}
              />
            ))}
          </div>
          {hasNext && !loading && !autoLoading && (
            <button className="load-more" onClick={() => fetchPage(page + 1, true)}>
              もっと見る
            </button>
          )}
          {(loading || autoLoading) && results.length > 0 && (
            <p className="loading-inline">読み込み中…（{results.length}件）</p>
          )}
        </main>
      )}

      {view === "list" && (
        <main className="grid-wrap">
          <div className="list-toolbar">
            <div className="list-tabs">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  className={listTab === s.key ? "list-tab active" : "list-tab"}
                  onClick={() => setListTab(s.key)}
                >
                  {s.ja}
                  <span className="count">{counts[s.key]}</span>
                </button>
              ))}
            </div>
            <label className="sort-label">
              並び替え
              <select value={ledgerSort} onChange={(e) => setLedgerSort(e.target.value)}>
                <option value="date">完了日・新しい順</option>
                <option value="season">放送シーズン・新しい順</option>
                <option value="season_asc">放送シーズン・古い順</option>
                <option value="rating">評価が高い順</option>
                <option value="title">タイトル順</option>
              </select>
            </label>
            <div className="io-row">
              {listTab === "want" && counts.want > 0 && (
                <button className="toolbar-btn" onClick={randomPick}>ランダムに選ぶ</button>
              )}
              <button className="toolbar-btn subtle" onClick={exportLedger}>エクスポート</button>
              <button className="toolbar-btn subtle" onClick={() => fileRef.current?.click()}>インポート</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => { importLedger(e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
          </div>
          {ioMsg && <p className="io-msg">{ioMsg}</p>}
          {listTab === "watched" && watchedStats.total > 0 && (
            <p className="stats-line">
              視聴済 {watchedStats.total}作品
              {watchedStats.rated > 0 && (
                <> ・ 評価済 {watchedStats.rated}件 ・ 平均 ★{watchedStats.avg.toFixed(2)}</>
              )}
            </p>
          )}
          {!ready && <p className="loading-inline">読み込み中…</p>}
          {ready && listEntries.length === 0 && (
            <p className="empty">
              まだ記録がありません。シーズンから作品を追加してください。
              <br /><span className="en-hint">Nothing here yet — browse a season to add shows.</span>
            </p>
          )}
          {groupedEntries.map((g, gi) => (
            <div key={gi} className="ledger-group">
              {g.header && <h3 className="group-header">{g.header} <span className="group-count">{g.items.length}件</span></h3>}
              <ul className="ledger">
                {g.items.map((e) => (
                  <li key={e.id} className="ledger-item">
                    <button className="ledger-cover" onClick={() => setDetailId(e.id)}>
                      {e.cover ? (
                        <img src={e.cover} alt="" loading="lazy"
                          onError={(ev) => { ev.target.style.display = "none"; }} />
                      ) : <div className="cover-empty small">–</div>}
                    </button>
                    <div className="ledger-body">
                      <p className="title-ja" onClick={() => setDetailId(e.id)}>
                        {e.title?.native || e.title?.romaji || e.title?.english}
                      </p>
                      {(e.title?.english || e.title?.romaji) && e.title?.native && (
                        <p className="title-sub">{e.title.english || e.title.romaji}</p>
                      )}
                      <p className="meta">
                        {seasonJa(e.season, e.seasonYear)}
                        {e.format ? ` ・ ${FORMAT_JA[e.format] || e.format}` : ""}
                      </p>
                      <ProgressControls entry={e} onProgress={setProgress(stubFromEntry(e))} />
                      <WatchedControls
                        entry={e}
                        onRate={setRating(stubFromEntry(e))}
                        onDate={setDate(stubFromEntry(e))}
                        onRewatch={setRewatch(stubFromEntry(e))}
                      />
                      <MemoBox entry={e} onSave={setMemo(stubFromEntry(e))} />
                    </div>
                    <div className="ledger-actions">
                      <StatusButtons entry={e} onSet={setStatus(stubFromEntry(e))} compact />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </main>
      )}

      {view === "stats" && <StatsView entries={entries} />}

      {detailId && (
        <DetailModal
          id={detailId}
          entry={entries[detailId]}
          tmdbKey={settings.tmdbKey}
          tmdbMap={tmdbMap}
          onMap={updateTmdbMap}
          showAdult={showAdult}
          onClose={() => setDetailId(null)}
          onOpen={(id) => { setSeiyuuId(null); setDetailId(id); }}
          onOpenSeiyuu={(id) => setSeiyuuId(id)}
          onSet={(status) => setStatus(detailMedia())(status)}
          onRate={(r) => setRating(detailMedia())(r)}
          onDate={(d) => setDate(detailMedia())(d)}
          onRewatch={(n) => setRewatch(detailMedia())(n)}
          onProgress={(p) => setProgress(detailMedia())(p)}
          onMemo={(m) => setMemo(detailMedia())(m)}
        />
      )}

      {seiyuuId && (
        <SeiyuuModal
          id={seiyuuId}
          showAdult={showAdult}
          onClose={() => setSeiyuuId(null)}
          onOpenWork={(id) => { setSeiyuuId(null); setDetailId(id); }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <footer className="footer">
        データ提供：AniList ・ 日本語あらすじ：TMDB ・ 配信情報：JustWatch（TMDB経由）・ 記録はこのブラウザに保存されます（エクスポートでバックアップ可能）
      </footer>
    </div>
  );
}

/* ---------- styles ---------- */

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }

.app {
  --ink: #23252B;
  --ink-soft: #6B6D75;
  --paper: #FAF9F5;
  --card: #FFFFFF;
  --line: #E6E3DA;
  --serif: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
  --sans: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif;
  font-family: var(--sans);
  background: var(--paper);
  color: var(--ink);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* header */
.header {
  display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--card);
  position: sticky; top: 0; z-index: 20;
}
.brand { cursor: pointer; display: flex; flex-direction: column; line-height: 1.1; }
.brand-kanji { font-family: var(--serif); font-size: 30px; font-weight: 600; letter-spacing: 0.14em; }
.brand-sub { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-soft); margin-top: 3px; }

.search { display: flex; flex: 1 1 260px; max-width: 460px; }
.search input {
  flex: 1; padding: 9px 12px; font-size: 14px; font-family: var(--sans);
  border: 1px solid var(--line); border-right: none; border-radius: 6px 0 0 6px;
  background: var(--paper); color: var(--ink);
}
.search input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.search button {
  padding: 9px 16px; font-size: 14px; border: 1px solid var(--accent);
  background: var(--accent); color: #fff; border-radius: 0 6px 6px 0; cursor: pointer;
}
.nav { display: flex; gap: 4px; margin-left: auto; align-items: center; }
.nav button {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 7px 14px; font-size: 14px; font-family: var(--sans);
  background: none; border: none; border-bottom: 3px solid transparent;
  color: var(--ink-soft); cursor: pointer;
}
.nav button.active { color: var(--ink); border-bottom-color: var(--accent); }
.nav button.gear { font-size: 18px; padding: 7px 10px; border-bottom: none; }
.nav-en { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; }

/* season navigation */
.season-nav { padding: 18px 22px 0; }
.decade-year-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.decade-year-row select, .sort-label select {
  padding: 7px 10px; font-size: 14px; font-family: var(--sans);
  border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink);
}
.year-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.year-chips.dim { opacity: 0.55; }
.chip {
  padding: 6px 12px; font-size: 13px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--card); color: var(--ink-soft); cursor: pointer; white-space: nowrap;
  font-family: var(--sans);
}
.chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }

.season-tabs { display: flex; gap: 10px; margin-top: 16px; align-items: stretch; flex-wrap: wrap; }
.season-tab {
  flex: 1; min-width: 84px; max-width: 150px; padding: 10px 6px 8px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--card);
  cursor: pointer; text-align: center; transition: transform 0.12s ease;
}
.season-tab:hover { transform: translateY(-2px); }
.season-tab.active { background: var(--tab-soft); border-color: var(--tab-color); box-shadow: inset 0 -3px 0 var(--tab-color); }
.season-kanji { display: block; font-family: var(--serif); font-size: 30px; font-weight: 600; color: var(--tab-color); }
.season-kanji.small { font-size: 22px; padding: 4px 0; }
.season-months { display: block; font-size: 10px; color: var(--ink-soft); margin-top: 2px; letter-spacing: 0.08em; }
.tab-divider { width: 1px; background: var(--line); margin: 4px 2px; }

.page-title { font-family: var(--serif); font-size: 26px; font-weight: 600; margin: 22px 0 4px; letter-spacing: 0.04em; }
.page-title-sub { font-family: var(--sans); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-soft); margin-left: 10px; }

/* toolbar + filters */
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.sort-label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-soft); }
.toolbar-btn {
  padding: 7px 14px; font-size: 13px; border: 1px solid var(--accent); color: var(--accent);
  background: none; border-radius: 999px; cursor: pointer; font-family: var(--sans);
}
.toolbar-btn:hover { background: var(--accent-soft); }
.toolbar-btn.on { background: var(--accent); color: #fff; }
.toolbar-btn.subtle { border-color: var(--line); color: var(--ink-soft); }
.toolbar-btn.subtle.on { background: var(--ink); border-color: var(--ink); color: #fff; }
.result-count { font-size: 12px; color: var(--ink-soft); margin-left: auto; }
.format-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.format-label { font-size: 12.5px; color: var(--ink-soft); margin-right: 4px; min-width: 68px; }

/* grid */
.grid-wrap { padding: 14px 22px 40px; flex: 1; }
.grid {
  display: grid; gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  overflow: hidden; display: flex; flex-direction: column;
}
.cover-btn { position: relative; border: none; padding: 0; cursor: pointer; background: #EEECE6; display: block; }
.cover-btn img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; display: block; }
.cover-empty { aspect-ratio: 2 / 3; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); font-size: 13px; }
.cover-empty.small { width: 100%; height: 100%; aspect-ratio: auto; }
.cover-badge {
  position: absolute; top: 8px; left: 8px; padding: 3px 9px; font-size: 11px;
  background: var(--accent); color: #fff; border-radius: 4px; letter-spacing: 0.06em;
}
.adult-badge {
  position: absolute; top: 8px; right: 8px; padding: 3px 8px; font-size: 11px;
  background: #A03D3D; color: #fff; border-radius: 4px; letter-spacing: 0.06em;
}
.card-body { padding: 12px 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.title-ja { font-family: var(--serif); font-size: 16px; font-weight: 600; margin: 0; line-height: 1.4; cursor: pointer; }
.title-ja:hover { color: var(--accent); }
.title-sub { font-size: 11.5px; color: var(--ink-soft); margin: 0; line-height: 1.35; }
.title-sub.big { font-size: 13px; }
.meta { font-size: 12px; color: var(--ink-soft); margin: 0; }
.air-date { color: var(--accent); }
.synopsis {
  font-size: 12.5px; line-height: 1.55; color: var(--ink); margin: 0;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.synopsis.full { display: block; -webkit-line-clamp: unset; overflow: visible; }
.en-syn { color: var(--ink-soft); margin-top: 8px; }
.text-link {
  align-self: flex-start; border: none; background: none; padding: 0;
  font-size: 12px; color: var(--accent); cursor: pointer; font-family: var(--sans);
  text-decoration: underline; text-underline-offset: 2px;
}
.card-links { margin: 0; display: flex; gap: 12px; font-size: 12px; }
.card-links a { color: var(--ink-soft); text-decoration: none; }
.card-links a:hover { color: var(--accent); text-decoration: underline; }

/* status buttons */
.status-row { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
.status-btn {
  padding: 5px 10px; font-size: 12px; font-family: var(--sans);
  border: 1px solid var(--line); border-radius: 999px; background: var(--card);
  color: var(--ink-soft); cursor: pointer;
}
.status-btn:hover { border-color: var(--accent); color: var(--accent); }
.status-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* progress + rewatch */
.mini-btn {
  width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 5px;
  background: var(--card); color: var(--ink); cursor: pointer; font-size: 13px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; font-family: var(--sans);
}
.mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.progress-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.progress-text { font-size: 12.5px; color: var(--ink); min-width: 64px; text-align: center; }
.progress-bar {
  flex: 1; height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; min-width: 40px;
}
.progress-bar span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
.rewatch { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-soft); }
.rewatch b { font-size: 13px; color: var(--ink); font-weight: 600; }

.watched-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
.date-label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-soft); }
.date-label input {
  font-size: 12px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px;
  background: var(--paper); color: var(--ink); font-family: var(--sans);
}
.memo {
  width: 100%; margin-top: 8px; padding: 8px 10px; font-size: 12.5px; line-height: 1.5;
  font-family: var(--sans); color: var(--ink); background: var(--paper);
  border: 1px solid var(--line); border-radius: 6px; resize: vertical;
}
.memo:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

/* stars */
.stars { display: inline-flex; align-items: center; gap: 1px; }
.star-wrap { position: relative; display: inline-block; }
.star-hit { position: absolute; top: 0; width: 50%; height: 100%; opacity: 0; border: none; cursor: pointer; padding: 0; }
.star-hit.left { left: 0; }
.star-hit.right { right: 0; }
.star-num { font-size: 12px; color: var(--ink-soft); margin-left: 6px; }

/* load more / states */
.load-more {
  display: block; margin: 26px auto 0; padding: 10px 34px; font-size: 14px;
  border: 1px solid var(--accent); color: var(--accent); background: none;
  border-radius: 999px; cursor: pointer; font-family: var(--sans);
}
.load-more:hover { background: var(--accent-soft); }
.loading-inline { text-align: center; color: var(--ink-soft); padding: 26px 0; }
.empty { text-align: center; color: var(--ink-soft); padding: 40px 0; line-height: 1.8; }
.error-banner {
  margin: 16px 22px 0; padding: 14px 16px; border: 1px solid #D9A0A0;
  background: #FBF0F0; border-radius: 8px; font-size: 13px; line-height: 1.6;
}
.notice-banner {
  margin: 16px 22px 0; padding: 12px 16px; border: 1px solid var(--line);
  background: var(--accent-soft); border-radius: 8px; font-size: 13px; line-height: 1.6;
}
.error-hint { color: var(--ink-soft); font-size: 12px; }
.error-inline { color: #A04040; padding: 20px; }
.en-hint { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); font-weight: 400; }
.fine { font-size: 11px; color: var(--ink-soft); margin: 8px 0 0; line-height: 1.6; }
.fine a { color: var(--accent); }

/* ledger */
.list-toolbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
.list-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.list-tab {
  padding: 8px 16px; font-size: 14px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--card); color: var(--ink-soft); cursor: pointer; display: flex; gap: 8px; align-items: center;
  font-family: var(--sans);
}
.list-tab.active { border-color: var(--accent); color: var(--ink); box-shadow: inset 0 -3px 0 var(--accent); }
.count { font-size: 11px; background: var(--accent-soft); border-radius: 999px; padding: 2px 8px; color: var(--ink); }
.io-row { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.io-msg { font-size: 12.5px; color: var(--accent); margin: 0 0 10px; }
.stats-line { font-size: 13px; color: var(--ink-soft); margin: 0 0 16px; }
.ledger-group { margin-bottom: 8px; }
.group-header {
  font-family: var(--serif); font-size: 17px; font-weight: 600;
  margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line);
  display: flex; align-items: baseline; gap: 10px;
}
.group-count { font-family: var(--sans); font-size: 11.5px; color: var(--ink-soft); font-weight: 400; }
.ledger { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.ledger-item {
  display: flex; gap: 14px; background: var(--card); border: 1px solid var(--line);
  border-radius: 10px; padding: 12px; align-items: flex-start;
}
.ledger-cover { width: 64px; flex: none; border: none; padding: 0; cursor: pointer; background: #EEECE6; border-radius: 6px; overflow: hidden; }
.ledger-cover img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
.ledger-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ledger-actions { flex: none; max-width: 220px; }

/* stats view */
.stats-wrap { max-width: 860px; }
.stat-section { margin-bottom: 10px; }
.stat-cards { display: flex; gap: 12px; flex-wrap: wrap; }
.stat-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 18px; display: flex; flex-direction: column; gap: 4px; min-width: 110px;
}
.stat-num { font-family: var(--serif); font-size: 26px; font-weight: 600; }
.stat-num.small { font-size: 18px; }
.stat-label { font-size: 11.5px; color: var(--ink-soft); }
.bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.bar-label { flex: none; width: 90px; font-size: 12.5px; color: var(--ink); text-align: right; }
.bar-track { flex: 1; height: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--accent); opacity: 0.75; }
.bar-val { flex: none; width: 54px; font-size: 12px; color: var(--ink-soft); }
.season-stat-row { display: flex; gap: 12px; flex-wrap: wrap; }
.season-stat {
  flex: 1; min-width: 100px; max-width: 160px; background: var(--tab-soft);
  border: 1px solid var(--line); border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.season-stat .season-kanji { color: var(--tab-color); }

/* modal */
.overlay {
  position: fixed; inset: 0; background: rgba(30,30,35,0.55); z-index: 50;
  display: flex; align-items: flex-start; justify-content: center; padding: 4vh 14px; overflow-y: auto;
}
.seiyuu-overlay { z-index: 60; }
.modal {
  position: relative; background: var(--card); border-radius: 12px; max-width: 760px; width: 100%;
  padding: 26px; margin-bottom: 4vh;
}
.settings-modal { max-width: 520px; }
.settings-input {
  width: 100%; padding: 9px 12px; font-size: 14px; font-family: var(--sans);
  border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink);
  margin-top: 8px;
}
.settings-input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.settings-actions { margin-top: 20px; display: flex; justify-content: flex-end; }
.close-btn {
  position: absolute; top: 12px; right: 14px; font-size: 22px; border: none; background: none;
  color: var(--ink-soft); cursor: pointer; line-height: 1;
}
.modal-head { display: flex; gap: 20px; }
.modal-cover { width: 170px; flex: none; border-radius: 8px; aspect-ratio: 2/3; object-fit: cover; }
.modal-headtext { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.eyebrow { font-size: 12px; color: var(--accent); letter-spacing: 0.08em; margin: 0; }
.modal-title { font-family: var(--serif); font-size: 24px; font-weight: 600; margin: 0; line-height: 1.35; }
.genres { font-size: 12px; color: var(--ink-soft); margin: 0; }
.modal-section { margin-top: 24px; }
.modal-section h4 {
  font-family: var(--serif); font-size: 16px; margin: 0 0 10px;
  border-bottom: 1px solid var(--line); padding-bottom: 6px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap;
}
.link-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip-link {
  font-size: 12.5px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px;
  color: var(--ink); text-decoration: none; background: var(--paper);
  display: inline-flex; align-items: center; gap: 7px;
}
.chip-link:hover { border-color: var(--accent); color: var(--accent); }
.chip-link.primary { border-color: var(--accent); background: var(--accent-soft); }
.provider-chip img { width: 20px; height: 20px; border-radius: 4px; }
.provider-group { margin-bottom: 10px; }
.provider-label { display: block; font-size: 11.5px; color: var(--ink-soft); margin-bottom: 5px; }
.candidate-list { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.candidate {
  text-align: left; padding: 7px 10px; font-size: 13px; font-family: var(--sans);
  border: 1px solid var(--line); border-radius: 7px; background: var(--paper);
  color: var(--ink); cursor: pointer;
}
.candidate:hover, .candidate.active { border-color: var(--accent); }
.cast-grid {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px;
}
.cast-item { display: flex; gap: 10px; align-items: flex-start; }
.cast-item img { width: 44px; aspect-ratio: 3/4; object-fit: cover; border-radius: 5px; flex: none; }
.cast-name { font-size: 13.5px; font-weight: 600; margin: 0; }
.cast-sub { font-size: 11px; color: var(--ink-soft); margin: 1px 0 0; }
.cast-va-link {
  border: none; background: none; padding: 0; margin-top: 3px; display: block;
  font-size: 12px; color: var(--accent); cursor: pointer; font-family: var(--sans);
  text-decoration: underline; text-underline-offset: 2px; text-align: left;
}
.seiyuu-head { display: flex; gap: 18px; align-items: center; }
.seiyuu-photo { width: 96px; aspect-ratio: 3/4; object-fit: cover; border-radius: 8px; flex: none; }
.relation-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.relation-item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper);
  cursor: pointer; font-family: var(--sans); color: var(--ink);
}
.relation-item:hover { border-color: var(--accent); }
.relation-item img { width: 32px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px; flex: none; }
.relation-tag {
  flex: none; font-size: 11px; background: var(--accent-soft); color: var(--ink);
  padding: 3px 8px; border-radius: 4px;
}
.relation-title { font-size: 13.5px; }

.footer {
  padding: 16px 22px 24px; font-size: 11.5px; color: var(--ink-soft);
  border-top: 1px solid var(--line); text-align: center; line-height: 1.7;
}

@media (max-width: 640px) {
  .modal-head { flex-direction: column; }
  .modal-cover { width: 130px; }
  .ledger-item { flex-wrap: wrap; }
  .ledger-actions { max-width: none; }
  .season-kanji { font-size: 24px; }
  .result-count { margin-left: 0; }
  .io-row { margin-left: 0; }
  .bar-label { width: 64px; }
}
@media (prefers-reduced-motion: reduce) {
  .season-tab { transition: none; }
}
`;
