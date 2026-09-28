import { useMemo } from "react";
import { SEASONS, STATUSES, FORMAT_JA } from "../constants.js";

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

export default StatsView;
