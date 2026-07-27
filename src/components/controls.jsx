import { useState, useEffect } from "react";
import { STATUSES } from "../constants.js";

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

export { StarRating, StatusButtons, ProgressControls, WatchedControls, MemoBox };
