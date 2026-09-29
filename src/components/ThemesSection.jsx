import { useState, useEffect } from "react";
import { getThemes, getJaTitles, themeTitleJa, themeArtist } from "../api/animethemes.js";

/* ---------- 主題歌 (OP/ED) inside the detail modal ----------
   Zero-key: AnimeThemes list + search links to YouTube / Spotify / Apple
   Music (no logins). Kanji titles from Jikan when it answers. */

const TYPE_JA = { OP: "OP", ED: "ED" };

const LINKS = [
  { key: "yt", label: "YouTube", url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  { key: "sp", label: "Spotify", url: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}` },
  { key: "am", label: "Apple Music", url: (q) => `https://music.apple.com/jp/search?term=${encodeURIComponent(q)}` },
];

const episodesJa = (s) => (s ? `${s.replace(/-/g, "–")}話` : "");

function ThemesSection({ media }) {
  const [state, setState] = useState({ loading: true });
  const [ja, setJa] = useState(null);

  useEffect(() => {
    if (!media?.id) return;
    let live = true;
    setState({ loading: true });
    setJa(null);
    getThemes([{ id: media.id, final: media.status === "FINISHED" }])
      .then((m) => {
        if (!live) return;
        const rec = m.get(media.id);
        setState({ themes: rec?.themes || [] });
        if (rec?.ja) setJa(rec.ja);
        else if (rec?.themes?.length && media.idMal)
          getJaTitles(media.id, media.idMal).then((j) => live && j && setJa(j));
      })
      .catch((e) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [media?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const themes = state.themes || [];
  if (!state.loading && !state.error && themes.length === 0) {
    return (
      <section className="modal-section">
        <h4>主題歌 <span className="en-hint">Theme songs</span></h4>
        <p className="fine">主題歌の情報は見つかりませんでした（AnimeThemes未登録）。</p>
      </section>
    );
  }

  return (
    <section className="modal-section">
      <h4>主題歌 <span className="en-hint">Theme songs — OP / ED</span></h4>
      <div aria-live="polite">
        {state.loading && <p className="fine">主題歌を取得中…</p>}
        {state.error && <p className="fine">主題歌の取得エラー：{state.error}</p>}
      </div>
      {themes.length > 0 && (
        <ul className="theme-list">
          {themes.map((t) => {
            const kanji = themeTitleJa(t, ja);
            const artist = themeArtist(t, ja);
            const q = `${kanji || t.title} ${artist}`.trim();
            return (
              <li key={t.slug} className="theme-item">
                <div className="theme-head">
                  <a className="theme-slug" href={t.url} target="_blank" rel="noreferrer"
                    title="AnimeThemesで映像を見る">{TYPE_JA[t.type] || t.type}{t.slug.replace(/^(OP|ED)/, "")}</a>
                  <span className="theme-title">
                    {kanji ? <>{kanji}<span className="theme-sub">（{t.title}）</span></> : t.title || "（曲名不明）"}
                  </span>
                </div>
                <p className="theme-meta">
                  {artist}{t.episodes ? ` ・ ${episodesJa(t.episodes)}` : ""}
                </p>
                <div className="link-chips">
                  {LINKS.map((l) => (
                    <a key={l.key} className="chip-link" href={l.url(q)} target="_blank" rel="noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {themes.length > 0 && (
        <p className="fine">
          主題歌データ：<a href="https://animethemes.moe/" target="_blank" rel="noreferrer">AnimeThemes</a>
          {ja && <> ・ 日本語曲名：MyAnimeList（Jikan経由）</>}
          {" ・ "}各サービスの検索結果を開きます
        </p>
      )}
    </section>
  );
}

export default ThemesSection;
