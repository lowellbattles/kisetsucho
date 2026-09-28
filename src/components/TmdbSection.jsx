import { useState, useEffect, useRef } from "react";
import { tmdbFindCandidates, tmdbDetails, TMDB_IMG } from "../api/tmdb.js";
import { stripHtml } from "../utils.js";

/* ---------- TMDB section inside the detail modal ---------- */

function TmdbSection({ media, tmdbKey, mapEntry, onMap, anilistDescription, anilistStreams }) {
  const [state, setState] = useState({ loading: false });
  const [fixOpen, setFixOpen] = useState(false);
  const [candidates, setCandidates] = useState(null);
  const [showEn, setShowEn] = useState(false);
  const fetchedRef = useRef(null); // [id, type, season] of the info on screen

  useEffect(() => {
    if (!media || !tmdbKey) { setState({ nokey: true }); return; }
    // persisting an auto-picked season re-runs this effect with the same
    // target — keep what's on screen instead of refetching
    const target = mapEntry && !mapEntry.none
      ? JSON.stringify([media.id, mapEntry.id, mapEntry.type, mapEntry.season ?? null]) : null;
    if (target && target === fetchedRef.current) return;
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
        const info = await tmdbDetails(m, tmdbKey, media);
        if (!live) return;
        fetchedRef.current = JSON.stringify([media.id, m.id, m.type, info.season ?? null]);
        setState({ info });
        if (info.autoPicked) onMap(media.id, { ...m, season: info.season }); // match once, cache
      } catch (e) {
        if (live) setState({ error: e.message });
      }
    })();
    return () => { live = false; };
  }, [media?.id, tmdbKey, mapEntry?.id, mapEntry?.none, mapEntry?.season]);

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
            {ja
              ? `Synopsis（日本語・TMDB${info?.seasonUsed ? `・シーズン${info.season}` : ""}）`
              : "Synopsis（英語・AniList）"}
          </span>
        </h4>
        <div aria-live="polite">
          {state.loading && <p className="fine">TMDBを照会中…</p>}
          {state.error && <p className="fine">TMDB照会エラー：{state.error}</p>}
        </div>
        {ja ? (
          <>
            <p className="synopsis full">{ja}</p>
            {info.season != null && !info.seasonUsed && (
              <p className="fine">
                シーズン{info.season}の日本語あらすじがTMDBにないため、シリーズ全体のあらすじを表示しています。
              </p>
            )}
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
        {fixOpen && info?.seasons?.length > 1 && (
          <div className="season-pick">
            <span className="provider-label">シーズン</span>
            <button
              className={info.season == null ? "chip active" : "chip"}
              onClick={() => onMap(media.id, { ...mapEntry, season: null })}
            >
              シリーズ全体
            </button>
            {info.seasons.map((s) => (
              <button
                key={s.n}
                className={info.season === s.n ? "chip active" : "chip"}
                onClick={() => onMap(media.id, { ...mapEntry, season: s.n })}
              >
                S{s.n}{s.year ? `（${s.year}）` : ""}
              </button>
            ))}
          </div>
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

export default TmdbSection;
