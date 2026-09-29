import { useState, useEffect, useId } from "react";
import Modal from "./Modal.jsx";
import { gql, DETAIL_QUERY } from "../api/anilist.js";
import { GENRES, FORMAT_JA, RELATION_JA } from "../constants.js";
import { snapshotFields, seasonJa, airDateLine, officialLink, infoLinks, anilistStreamingLinks } from "../utils.js";
import { StatusButtons, ProgressControls, WatchedControls, MemoBox } from "./controls.jsx";
import TmdbSection from "./TmdbSection.jsx";
import AnnictSection from "./AnnictSection.jsx";
import ThemesSection from "./ThemesSection.jsx";

/* ---------- detail modal ---------- */

function DetailModal({
  id, entry, tmdbKey, tmdbMap, onMap, annictToken, annictMap, onAnnictMap, showAdult,
  onClose, onSet, onRate, onDate, onRewatch, onProgress, onMemo, onOpen, onOpenSeiyuu, onSnapshot,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const titleId = useId();

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    gql(DETAIL_QUERY, { id })
      .then((d) => {
        if (!live) return;
        setData(d.Media);
        if (d.Media) onSnapshot?.(d.Media.id, snapshotFields(d.Media)); // no-op if untracked
      })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [id]);

  const t = data?.title || {};
  const relations = (data?.relations?.edges || []).filter((e) => e.node?.type === "ANIME");
  const official = data ? officialLink(data) : null;
  const others = data ? infoLinks(data) : [];
  const dateLine = data ? airDateLine(data) : "";

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
        <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        {err && <p className="error-inline" role="alert">読み込みに失敗しました — {err}</p>}
        {!data && !err && <p className="loading-inline" role="status">読み込み中…</p>}
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
                <h2 className="modal-title" id={titleId}>{t.native || t.romaji}</h2>
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
                <ProgressControls entry={entry} onProgress={onProgress} onComplete={onSet} />
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

            <ThemesSection media={data} />

            <AnnictSection
              media={data}
              token={annictToken}
              mapEntry={annictMap[data.id]}
              onMap={onAnnictMap}
              onSnapshot={onSnapshot}
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
    </Modal>
  );
}

export default DetailModal;
