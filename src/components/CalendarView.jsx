import { useState, useEffect, useMemo } from "react";
import { STATUSES } from "../constants.js";
import { fetchAiringByIds } from "../api/anilist.js";
import { fetchWorkChannels } from "../api/annict.js";

/* ---------- 放送 — weekly airing calendar (HANDOFF §10 P3) ----------
   Zero-key base: AniList airingSchedule for the ledger's 視聴中 / 見たい /
   保留 works (one request per 50). Optional Annict enrichment (token +
   already-matched works only — no matching runs from here): first-run
   channel names and a しょぼいカレンダー link. Syoboi itself sends no CORS
   headers (probed 2026-09), so it is linked, not fetched.
   Days follow Japanese TV listings: a day runs 05:00–28:59 JST, so a
   Thursday 25:30 broadcast sits under Thursday, shown as 25:30. */

const CAL_STATUSES = ["watching", "want", "hold"];
const STATUS_JA = Object.fromEntries(STATUSES.map((s) => [s.key, s.ja]));
const DAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
const DAYS = 7;
const DAY_START_H = 5;
const JST_MS = 9 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

/* broadcast-day index (days since epoch, JST, day starting 05:00) */
const broadcastDay = (ms) => Math.floor((ms + JST_MS - DAY_START_H * HOUR_MS) / (24 * HOUR_MS));

function slotLabel(ms) {
  const jst = new Date(ms + JST_MS);
  let h = jst.getUTCHours();
  if (h < DAY_START_H) h += 24; // 深夜 → 24:00–28:59
  return `${h}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

function dayLabel(day) {
  const d = new Date(day * 24 * HOUR_MS); // UTC midnight of that JST calendar date
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DAY_JA[d.getUTCDay()]}）`;
}

function dateLabel(ms) {
  const d = new Date(ms + JST_MS);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${DAY_JA[d.getUTCDay()]}）${slotLabel(ms)}`;
}

function CalendarView({ entries, annictToken, annictMap, onOpen }) {
  const targets = useMemo(
    () => Object.values(entries).filter((e) => CAL_STATUSES.includes(e.status)),
    [entries]);
  const idKey = targets.map((e) => e.id).sort((a, b) => a - b).join(",");
  const [state, setState] = useState({ loading: true });
  const [channels, setChannels] = useState(new Map()); // annictId → {channels, syobocalTid}

  useEffect(() => {
    if (!targets.length) { setState({ media: new Map() }); return; }
    let live = true;
    setState({ loading: true });
    fetchAiringByIds(targets.map((e) => e.id))
      .then((media) => live && setState({ media }))
      .catch((err) => live && setState({ error: err.message }));
    return () => { live = false; };
  }, [idKey]); // eslint-disable-line -- refetch only when the target set changes

  // Annict enrichment for airing works that are already matched
  const media = state.media;
  const annictIds = useMemo(() => {
    if (!media || !annictToken) return [];
    return [...media.keys()].map((id) => annictMap[id]?.annictId).filter(Boolean);
  }, [media, annictToken, annictMap]);
  const annictKey = annictIds.slice().sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!annictIds.length) return;
    let live = true;
    fetchWorkChannels(annictIds, annictToken)
      .then((m) => live && setChannels(m))
      .catch(() => {}); // enrichment only — the calendar stands without it
    return () => { live = false; };
  }, [annictKey, annictToken]); // eslint-disable-line

  const { days, later, unknown } = useMemo(() => {
    const today = broadcastDay(Date.now());
    const days = Array.from({ length: DAYS }, (_, i) => ({ day: today + i, items: [] }));
    const later = [];
    const unknown = [];
    if (!media) return { days, later, unknown };
    for (const m of media.values()) {
      const entry = entries[m.id];
      const nodes = m.airingSchedule?.nodes?.length
        ? m.airingSchedule.nodes
        : m.nextAiringEpisode ? [m.nextAiringEpisode] : [];
      if (!nodes.length) { unknown.push({ m, entry }); continue; }
      let inWindow = false;
      for (const n of nodes) {
        const ms = n.airingAt * 1000;
        const slot = days[broadcastDay(ms) - today];
        if (!slot) continue;
        inWindow = true;
        slot.items.push({ m, entry, ms, ep: n.episode, last: m.episodes && n.episode === m.episodes });
      }
      if (!inWindow) later.push({ m, entry, ms: nodes[0].airingAt * 1000, ep: nodes[0].episode });
    }
    days.forEach((d) => d.items.sort((a, b) => a.ms - b.ms));
    later.sort((a, b) => a.ms - b.ms);
    return { days, later, unknown };
  }, [media, entries]);

  const title = (m) => m.title?.native || m.title?.romaji || m.title?.english;
  const extra = (m) => {
    const a = annictMap[m.id]?.annictId;
    return a ? channels.get(a) : null;
  };
  const unmatched = annictToken && media
    ? [...media.keys()].filter((id) => !annictMap[id]).length : 0;
  const totalWeek = days.reduce((s, d) => s + d.items.length, 0);

  if (!targets.length) {
    return (
      <main className="grid-wrap">
        <p className="empty">
          「視聴中」「見たい」「保留」の作品がまだありません。放送中の作品を記録すると、ここに今週の放送予定が表示されます。
          <br /><span className="en-hint">Track airing shows to see this week's schedule.</span>
        </p>
      </main>
    );
  }

  return (
    <main className="grid-wrap cal-wrap">
      <h1 className="page-title">
        今週の放送 <span className="page-title-sub">Airing this week</span>
      </h1>
      <p className="stats-line" aria-live="polite">
        {state.loading ? "読み込み中…" : state.error ? "" : `今後7日間 ${totalWeek}本（日本時間・深夜は24時以降表記）`}
      </p>
      {state.error && (
        <p className="error-inline">放送予定を取得できませんでした — {state.error}</p>
      )}

      {media && (
        <div className="cal-grid">
          {days.map((d, i) => (
            <section key={d.day} className={`cal-day${i === 0 ? " today" : ""}${d.items.length ? "" : " no-items"}`}>
              <h3 className="cal-day-head">
                {dayLabel(d.day)}{i === 0 && <span className="cal-today">今日</span>}
              </h3>
              {d.items.length === 0 && <p className="cal-none">—</p>}
              <ul className="cal-list">
                {d.items.map((it) => {
                  const x = extra(it.m);
                  return (
                    <li key={`${it.m.id}-${it.ep}`}>
                      <button className="cal-item" onClick={() => onOpen(it.m.id)}>
                        <span className="cal-time">{slotLabel(it.ms)}</span>
                        <span className="cal-body">
                          <span className="cal-title">{title(it.m)}</span>
                          <span className="cal-meta">
                            {it.last ? "最終話" : `第${it.ep}話`}
                            {it.entry ? ` ・ ${STATUS_JA[it.entry.status]}` : ""}
                            {x?.channels?.length ? ` ・ ${x.channels.slice(0, 2).join("・")}${x.channels.length > 2 ? " 他" : ""}` : ""}
                          </span>
                        </span>
                      </button>
                      {x?.syobocalTid && (
                        <a className="cal-syoboi" href={`https://cal.syoboi.jp/tid/${x.syobocalTid}`}
                          target="_blank" rel="noreferrer" aria-label={`しょぼいカレンダー：${title(it.m)}`}>
                          しょぼいカレンダー ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {later.length > 0 && (
        <section className="stat-section">
          <h3 className="group-header">来週以降 <span className="group-count">Later</span></h3>
          <ul className="cal-later">
            {later.map((it) => (
              <li key={it.m.id}>
                <button className="cal-item" onClick={() => onOpen(it.m.id)}>
                  <span className="cal-body">
                    <span className="cal-title">{title(it.m)}</span>
                    <span className="cal-meta">{dateLabel(it.ms)} ・ 第{it.ep}話</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unknown.length > 0 && (
        <p className="fine">
          放送日未定：{unknown.map((u) => title(u.m)).join("、")}
        </p>
      )}

      <p className="fine">
        放送時間：AniList（初回放送）
        {channels.size > 0 && <> ・ 放送局：Annict</>}
      </p>
      {unmatched > 0 && (
        <p className="fine">
          {unmatched}件はAnnictと未照合のため放送局を表示していません（作品の詳細を開くか「Annictと同期」で照合されます）。
        </p>
      )}
    </main>
  );
}

export default CalendarView;
