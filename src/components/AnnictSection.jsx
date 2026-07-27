import { useState, useEffect } from "react";
import { findAnnictWork, annictWorkDetails } from "../api/annict.js";

/* ---------- Annict section inside the detail modal (HANDOFF §10.1) ----------
   Mirrors TmdbSection's flow: token-gated fetch → resolve-once into the
   annictmap cache via onMap → effect re-runs with the stored mapping and
   fetches details. Programs are per-episode broadcast instances, so the
   放送情報 list groups them by channel and shows each channel's latest slot. */

const DAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatBroadcast(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DAY_JA[d.getDay()]}）${hh}:${mm}`;
}

function groupByChannel(programs) {
  const byChannel = new Map();
  for (const p of programs) {
    const name = p.channel?.name || "チャンネル不明";
    const t = Date.parse(p.startedAt) || 0;
    const cur = byChannel.get(name);
    if (!cur || t > cur.t)
      byChannel.set(name, { name, t, startedAt: p.startedAt, rebroadcast: p.rebroadcast });
  }
  return [...byChannel.values()].sort((a, b) => b.t - a.t).slice(0, 6);
}

function AnnictSection({ media, token, mapEntry, onMap }) {
  const [state, setState] = useState({ loading: false });
  const [showAllStaff, setShowAllStaff] = useState(false);

  useEffect(() => {
    if (!media) return;
    if (!token) { setState({ notoken: true }); return; }
    if (!media.idMal && !mapEntry) { setState({ nomal: true }); return; }
    let live = true;
    (async () => {
      setState({ loading: true });
      setShowAllStaff(false);
      try {
        let m = mapEntry;
        if (!m) {
          const found = await findAnnictWork(media, token);
          m = found || { none: true };
          onMap(media.id, m);
          return; // effect re-runs with the stored mapping
        }
        if (m.none) { if (live) setState({ none: true }); return; }
        const info = await annictWorkDetails(m.annictId, token);
        if (live) setState(info ? { info } : { none: true });
      } catch (e) {
        if (live) setState({ error: e.message });
      }
    })();
    return () => { live = false; };
  }, [media?.id, token, mapEntry?.annictId, mapEntry?.none]);

  const info = state.info;
  const channels = info ? groupByChannel(info.programs) : [];
  const staffs = info?.staffs || [];

  return (
    <section className="modal-section">
      <h4>放送情報・満足度 <span className="en-hint">JP Broadcasts &amp; Community — Annict</span></h4>
      {state.notoken && (
        <p className="fine">
          Annictトークンを設定すると、日本のTV放送情報・満足度・スタッフ情報が表示されます（⚙ 設定）。
        </p>
      )}
      {state.loading && <p className="fine">Annictを照会中…</p>}
      {state.error && <p className="fine">Annict照会エラー：{state.error}</p>}
      {state.nomal && (
        <p className="fine">この作品はMAL IDが登録されていないため、Annict情報を取得できません。</p>
      )}
      {state.none && <p className="fine">Annictで該当作品が見つかりませんでした。</p>}
      {info && (
        <>
          <p className="annict-rate">
            満足度{" "}
            {info.satisfactionRate != null ? <b>{info.satisfactionRate.toFixed(1)}%</b> : "評価データなし"}
            {" ・ "}視聴者 {info.watchersCount.toLocaleString()}人
          </p>
          {channels.length > 0 && (
            <div className="annict-block">
              <span className="provider-label">放送情報</span>
              <ul className="annict-list">
                {channels.map((c) => (
                  <li key={c.name}>
                    <span className="annict-channel">{c.name}</span>
                    <span className="annict-soft">
                      {formatBroadcast(c.startedAt)}
                      {c.rebroadcast ? "（再放送）" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {staffs.length > 0 && (
            <div className="annict-block">
              <span className="provider-label">スタッフ</span>
              <ul className="annict-list">
                {(showAllStaff ? staffs : staffs.slice(0, 12)).map((s, i) => (
                  <li key={i}>
                    <span className="annict-channel">{s.roleText}</span>
                    <span>{s.name}</span>
                  </li>
                ))}
              </ul>
              {staffs.length > 12 && (
                <button className="text-link" onClick={() => setShowAllStaff(!showAllStaff)}>
                  {showAllStaff ? "閉じる" : `すべて表示（${staffs.length}名）`}
                </button>
              )}
            </div>
          )}
          <p className="fine">
            データ提供：<a href={info.url} target="_blank" rel="noreferrer">Annict</a>
          </p>
        </>
      )}
    </section>
  );
}

export default AnnictSection;
