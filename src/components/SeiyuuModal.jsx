import { useState, useEffect, useCallback } from "react";
import { gql, STAFF_QUERY } from "../api/anilist.js";
import { ROLE_JA } from "../constants.js";
import { seasonJa } from "../utils.js";

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

export default SeiyuuModal;
