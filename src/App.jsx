/* ============================================================
   季節帳 — Seasonal Anime Ledger (v4)
   Data: AniList GraphQL (browsing/cast) + TMDB (JA synopses,
         JP streaming via JustWatch data — attribution required)
   Persistence: window.storage + export/import to JSON
   ============================================================ */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "./styles.css";
import {
  SEASONS, SCOPE_TABS, SORTS, FORMATS, GENRES, STATUSES,
  FORMAT_JA, SEASON_ORDER,
} from "./constants.js";
import { defaultTmdbKey } from "./env.js";
import { gql, buildBrowseQuery, buildSearchQuery, PER_PAGE, MAX_AUTO_PAGES } from "./api/anilist.js";
import { today, currentSeason, seasonJa } from "./utils.js";
import { STORE_KEY, SETTINGS_KEY, TMDBMAP_KEY, storageGetJson, storageSetJson } from "./storage.js";
import { StatusButtons, ProgressControls, WatchedControls, MemoBox } from "./components/controls.jsx";
import AnimeCard from "./components/AnimeCard.jsx";
import DetailModal from "./components/DetailModal.jsx";
import SeiyuuModal from "./components/SeiyuuModal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import StatsView from "./components/StatsView.jsx";

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
