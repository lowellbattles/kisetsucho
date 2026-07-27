import { useState } from "react";
import { STATUSES, FORMAT_JA } from "../constants.js";
import { stripHtml, officialLink, airDateLine } from "../utils.js";
import { StatusButtons, ProgressControls, WatchedControls } from "./controls.jsx";

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

export default AnimeCard;
