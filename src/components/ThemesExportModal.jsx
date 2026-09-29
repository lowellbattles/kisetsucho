import { useState, useEffect, useRef, useId } from "react";
import Modal from "./Modal.jsx";
import { STATUSES } from "../constants.js";
import { today } from "../utils.js";
import { getThemes, themeTitleJa, themeArtist } from "../api/animethemes.js";

/* ---------- 主題歌リストを書き出し (playlist export) ----------
   Gathers OP/ED songs for a set of ledger works (one AnimeThemes request
   per 50 works, cached) and outputs a CSV or "Artist - Title" text that
   TuneMyMusic / Soundiiz can turn into a Spotify, Apple Music or YouTube
   Music playlist. No logins here — direct playlist creation is a possible
   later step (Spotify OAuth), deliberately not built yet. */

const STATUS_JA = Object.fromEntries(STATUSES.map((s) => [s.key, s.ja]));
const TYPES = [
  { key: "both", ja: "OP + ED" },
  { key: "OP", ja: "OPのみ" },
  { key: "ED", ja: "EDのみ" },
];

const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function ThemesExportModal({ entries, listTab, onClose }) {
  const titleId = useId();
  const [scope, setScope] = useState("watched");
  const [types, setTypes] = useState("both");
  const [phase, setPhase] = useState("input"); // input | loading | ready | error
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null); // { songs, works, missing }
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => { liveRef.current = false; };
  }, []);

  const SCOPES = [
    { key: "tab", ja: `表示中のタブ（${STATUS_JA[listTab]}）` },
    { key: "watched", ja: "視聴済すべて" },
    { key: "all", ja: "全記録" },
  ];
  const works = Object.values(entries).filter((e) =>
    scope === "all" ? true : scope === "watched" ? e.status === "watched" : e.status === listTab);

  const run = async () => {
    setPhase("loading");
    setProgress(null);
    try {
      const recs = await getThemes(works.map((e) => ({ id: e.id, final: false })), {
        onProgress: (p) => liveRef.current && setProgress(p),
      });
      if (!liveRef.current) return;
      const songs = [];
      const seen = new Set();
      let missing = 0;
      for (const e of works) {
        const rec = recs.get(e.id);
        const list = (rec?.themes || []).filter((t) => types === "both" || t.type === types);
        if (!rec?.themes?.length) missing++;
        for (const t of list) {
          const title = themeTitleJa(t, rec.ja) || t.title;
          const artist = themeArtist(t, rec.ja);
          const key = `${title}\u0000${artist}`.toLowerCase();
          if (!title || seen.has(key)) continue; // same song across seasons → once
          seen.add(key);
          songs.push({
            title, artist, type: t.slug,
            anime: e.title?.native || e.title?.romaji || e.title?.english || "",
          });
        }
      }
      setResult({ songs, works: works.length, missing });
      setPhase("ready");
    } catch (e) {
      if (liveRef.current) { setError(e.message); setPhase("error"); }
    }
  };

  const text = result ? result.songs.map((s) => `${s.artist} - ${s.title}`).join("\n") : "";

  const downloadCsv = () => {
    const lines = ["Title,Artist,Album,Type",
      ...result.songs.map((s) => [s.title, s.artist, s.anime, s.type].map(csvCell).join(","))];
    // BOM so Excel / Numbers open the Japanese text correctly
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kisetsucho-themes-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked — the textarea stays selectable
    }
  };

  return (
    <Modal onClose={onClose} closable={phase !== "loading"} labelledBy={titleId} className="settings-modal">
      {phase !== "loading" && <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>}
      <h2 className="modal-title" id={titleId}>主題歌リストを書き出し <span className="en-hint">Theme-song playlist</span></h2>

      {phase === "input" && (
        <section className="modal-section">
          <p className="fine">
            記録した作品のOP・ED曲をリストにします。CSVは TuneMyMusic や Soundiiz で読み込むと、
            Spotify・Apple Music・YouTube Music のプレイリストにできます（各サービスのアカウントが必要です）。
          </p>
          <div className="import-row">
            <span className="provider-label">対象</span>
            {SCOPES.map((s) => (
              <button key={s.key} className={scope === s.key ? "chip active" : "chip"} onClick={() => setScope(s.key)}>
                {s.ja}
              </button>
            ))}
          </div>
          <div className="import-row">
            <span className="provider-label">曲</span>
            {TYPES.map((t) => (
              <button key={t.key} className={types === t.key ? "chip active" : "chip"} onClick={() => setTypes(t.key)}>
                {t.ja}
              </button>
            ))}
          </div>
          <div className="sync-actions">
            <span className="fine">{works.length}作品</span>
            <button className="toolbar-btn on" onClick={run} disabled={!works.length}>リストを作る</button>
          </div>
        </section>
      )}

      {phase === "loading" && (
        <section className="modal-section">
          <p className="sync-progress" aria-live="polite">
            主題歌を取得中…{progress?.total ? ` ${progress.n} / ${progress.total}作品` : ""}
          </p>
        </section>
      )}

      {phase === "ready" && result && (
        <section className="modal-section">
          <p className="sync-summary" role="status">
            {result.songs.length}曲 ・ {result.works}作品
            {result.missing > 0 && `（うち${result.missing}作品は主題歌データなし）`}
          </p>
          {result.songs.length > 0 ? (
            <>
              <textarea className="memo import-text" readOnly value={text} aria-label="主題歌リスト"
                onFocus={(e) => e.target.select()} />
              <div className="sync-actions">
                <button className="toolbar-btn subtle" onClick={() => setPhase("input")}>条件を変える</button>
                <button className="toolbar-btn subtle" onClick={copyText}>{copied ? "コピーしました" : "テキストをコピー"}</button>
                <button className="toolbar-btn on" onClick={downloadCsv}>CSVをダウンロード</button>
              </div>
              <p className="fine">
                曲名は日本語が分かる場合は日本語、それ以外はローマ字です。主題歌データ：AnimeThemes
              </p>
            </>
          ) : (
            <div className="sync-actions">
              <button className="toolbar-btn subtle" onClick={() => setPhase("input")}>条件を変える</button>
            </div>
          )}
        </section>
      )}

      {phase === "error" && (
        <section className="modal-section">
          <p className="sync-fail" role="alert">取得に失敗しました：{error}</p>
          <div className="sync-actions">
            <button className="toolbar-btn subtle" onClick={() => setPhase("input")}>戻る</button>
          </div>
        </section>
      )}
    </Modal>
  );
}

export default ThemesExportModal;
