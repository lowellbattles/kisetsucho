import { useMemo } from "react";
import { SEASONS, STATUSES, FORMAT_JA, GENRES } from "../constants.js";

const GENRE_JA = Object.fromEntries(GENRES.map((g) => [g.key, g.ja]));
const PACE_MONTHS = 24;
const TOP_N = 8;

/* month index helpers — "YYYY-MM" ↔ y*12 + (m-1) */
const monthIdx = (ym) => parseInt(ym.slice(0, 4), 10) * 12 + parseInt(ym.slice(5, 7), 10) - 1;
const idxLabel = (i) => `${Math.floor(i / 12)}年${(i % 12) + 1}月`;

/* Longest run of consecutive months with ≥1 completion, plus the current
   run (ending this month, or last month if nothing is logged yet this month). */
function monthStreaks(monthSet, nowIdx) {
  const months = [...monthSet].sort((a, b) => a - b);
  let best = { len: 0, from: null, to: null };
  let runStart = null;
  for (let i = 0; i < months.length; i++) {
    if (i === 0 || months[i] !== months[i - 1] + 1) runStart = months[i];
    const len = months[i] - runStart + 1;
    if (len > best.len) best = { len, from: runStart, to: months[i] };
  }
  let end = monthSet.has(nowIdx) ? nowIdx : monthSet.has(nowIdx - 1) ? nowIdx - 1 : null;
  let current = 0;
  while (end !== null && monthSet.has(end - current)) current++;
  return { best, current };
}

function topCounts(list, keyOf) {
  const c = {};
  for (const e of list) for (const k of keyOf(e) || []) c[k] = (c[k] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_N);
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

    /* monthly pace + streaks (completion month of 視聴済) */
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    const byMonth = {};
    watched.forEach((e) => {
      if (!/^\d{4}-\d{2}/.test(e.completedDate || "")) return;
      const i = monthIdx(e.completedDate);
      byMonth[i] = (byMonth[i] || 0) + 1;
    });
    const pace = [];
    for (let i = nowIdx - PACE_MONTHS + 1; i <= nowIdx; i++) pace.push({ i, n: byMonth[i] || 0 });
    const thisYear = pace.filter((p) => Math.floor(p.i / 12) === now.getFullYear()).reduce((s, p) => s + p.n, 0);
    const last12 = pace.slice(-12).reduce((s, p) => s + p.n, 0);
    const streaks = monthStreaks(new Set(Object.keys(byMonth).map(Number)), nowIdx);

    /* top studios / genres — snapshot fields, backfilled on detail open */
    const topStudios = topCounts(watched, (e) => e.studios);
    const topGenres = topCounts(watched, (e) => e.genres);
    const missingMeta = watched.filter((e) => !e.studios && !e.genres).length;

    return {
      all, watched, rated, avg, rewatches, byAirYear, byCompYear, byFormat, ratingDist, bySeason,
      pace, thisYear, last12, streaks, hasPace: Object.keys(byMonth).length > 0,
      topStudios, topGenres, missingMeta,
    };
  }, [entries]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
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
  const maxPace = Math.max(0, ...stats.pace.map((p) => p.n));

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

      {stats.hasPace && (
        <section className="stat-section">
          <h3 className="group-header">月別ペース <span className="group-count">Monthly pace — last {PACE_MONTHS} months</span></h3>
          <p className="stats-line">
            今年 {stats.thisYear}本 ・ 過去12か月 平均 {(stats.last12 / 12).toFixed(1)}本/月
          </p>
          <div className="pace-chart" role="img"
            aria-label={`月別の視聴済数、直近${PACE_MONTHS}か月`}>
            {stats.pace.map((p) => {
              const m = (p.i % 12) + 1;
              return (
                <div key={p.i} className="pace-col" title={`${idxLabel(p.i)}：${p.n}本`}>
                  <span className="pace-n">{p.n || ""}</span>
                  <span className="pace-bar" style={{ height: `${maxPace ? (p.n / maxPace) * 100 : 0}%` }} />
                  <span className="pace-m">{m === 1 ? `${Math.floor(p.i / 12) % 100}年` : m % 3 === 1 ? `${m}月` : ""}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {stats.hasPace && (
        <section className="stat-section">
          <h3 className="group-header">連続記録 <span className="group-count">Streaks — consecutive months with a completion</span></h3>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-num">{stats.streaks.best.len}か月</span>
              <span className="stat-label">
                最長連続{stats.streaks.best.len > 0 &&
                  `（${idxLabel(stats.streaks.best.from)}〜${idxLabel(stats.streaks.best.to)}）`}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{stats.streaks.current}か月</span>
              <span className="stat-label">現在の連続記録</span>
            </div>
          </div>
        </section>
      )}

      {(stats.topStudios.length > 0 || stats.topGenres.length > 0) && (
        <section className="stat-section">
          <h3 className="group-header">よく見るスタジオ・ジャンル <span className="group-count">Top studios &amp; genres</span></h3>
          <div className="stat-split">
            {stats.topStudios.length > 0 && (
              <div>
                <p className="stat-sub">制作スタジオ</p>
                {stats.topStudios.map(([k, n]) => (
                  <BarRow key={k} label={k} value={n} max={stats.topStudios[0][1]} suffix="本" />
                ))}
              </div>
            )}
            {stats.topGenres.length > 0 && (
              <div>
                <p className="stat-sub">ジャンル</p>
                {stats.topGenres.map(([k, n]) => (
                  <BarRow key={k} label={GENRE_JA[k] || k} value={n} max={stats.topGenres[0][1]} suffix="本" />
                ))}
              </div>
            )}
          </div>
          {stats.missingMeta > 0 && (
            <p className="fine">
              {stats.missingMeta}件はスタジオ・ジャンル情報が未取得です（作品の詳細を開くと補完されます）。
            </p>
          )}
        </section>
      )}

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

export default StatsView;
