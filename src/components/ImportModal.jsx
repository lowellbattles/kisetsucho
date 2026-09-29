import { useState, useEffect, useRef, useId } from "react";
import Modal from "./Modal.jsx";
import ListSection from "./ListSection.jsx";
import { STATUSES } from "../constants.js";
import { seasonJa, snapshotFields } from "../utils.js";
import { fetchMediaByMalIds, fetchUserList, searchCandidates } from "../api/anilist.js";
import {
  parseMalXml, mapMalRow, mapAniListEntry, parseTitleList, planImport, mergeOverwrite,
} from "../importers.js";

/* ---------- 他サービスから取り込む (watch-history import) ----------
   Same contract as the Annict sync: input → 照合中 → (テキスト: 確認) →
   プレビュー → 完了, and NOTHING is written to the ledger before 取り込む.
   Sources: MyAnimeList export (.xml / .xml.gz), a public AniList list,
   pasted titles or a Netflix viewing-history CSV. Existing ledger entries
   are kept unless flipped to 上書き. */

const STATUS_JA = Object.fromEntries(STATUSES.map((s) => [s.key, s.ja]));
const TABS = [
  { key: "mal", ja: "MyAnimeList", en: "XML export" },
  { key: "anilist", ja: "AniList", en: "Username" },
  { key: "text", ja: "テキスト・CSV", en: "Paste / Netflix" },
];
const TEXT_CAP = 200;
const TEXT_SPACING_MS = 2100; // ~28 searches/min — under AniList's ~30/min
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titleOf = (e) => e?.title?.native || e?.title?.romaji || e?.title?.english || `#${e?.id}`;

/* MAL's download is gzipped; plain .xml works too */
async function readMalFile(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("このブラウザは .gz の展開に対応していません。展開した .xml を選んでください。");
    return new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return file.text();
}

function entryLine(e) {
  const bits = [STATUS_JA[e.status]];
  if (e.rating) bits.push(`★${e.rating.toFixed(1)}`);
  if (e.progress) bits.push(`${e.progress}話`);
  if (e.completedDate) bits.push(e.completedDate);
  return bits.join(" ・ ");
}

function ImportModal({ entries, onApply, onClose }) {
  const titleId = useId();
  const [tab, setTab] = useState("mal");
  const [phase, setPhase] = useState("input"); // input | matching | review | preview | done | error
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [userName, setUserName] = useState("");
  const [text, setText] = useState("");
  const [defaultStatus, setDefaultStatus] = useState("watched");
  const [rows, setRows] = useState([]);      // text review: { title, date, cands, pick, status }
  const [plan, setPlan] = useState(null);    // { add, existing }
  const [skipped, setSkipped] = useState([]); // { title, reason }
  const [overwrite, setOverwrite] = useState({}); // id → true
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const liveRef = useRef(true);
  const stopRef = useRef(false);
  useEffect(() => {
    liveRef.current = true;
    return () => { liveRef.current = false; };
  }, []);

  const busy = phase === "matching";
  const fail = (e) => { if (liveRef.current) { setError(e.message || String(e)); setPhase("error"); } };
  const toPreview = (incoming, skips) => {
    setPlan(planImport(incoming, entries));
    setSkipped(skips);
    setOverwrite({});
    setPhase("preview");
  };

  /* MyAnimeList: file → rows → AniList by MAL id (×50 per request) */
  const runMal = async (file) => {
    if (!file) return;
    setPhase("matching");
    setProgress({ label: "ファイルを読み込み中" });
    try {
      const malRows = parseMalXml(await readMalFile(file));
      if (!malRows.length) throw new Error("作品が見つかりませんでした（アニメリストのエクスポートか確認してください）。");
      setProgress({ label: `AniListと照合中（${malRows.length}件）` });
      const byMal = await fetchMediaByMalIds([...new Set(malRows.map((r) => r.malId))]);
      if (!liveRef.current) return;
      const incoming = [];
      const skips = [];
      for (const r of malRows) {
        const media = byMal.get(r.malId);
        if (!r.status) skips.push({ title: r.title, reason: "ステータス不明" });
        else if (!media) skips.push({ title: r.title, reason: "AniListに該当作品なし" });
        else incoming.push(mapMalRow(r, media));
      }
      toPreview(incoming, skips);
    } catch (e) {
      fail(/myanimelist export/i.test(e.message)
        ? new Error("MyAnimeListのエクスポートファイル（animelist_….xml.gz）を選んでください。")
        : e);
    }
  };

  /* AniList: public list by username */
  const runAniList = async () => {
    const name = userName.trim();
    if (!name) return;
    setPhase("matching");
    setProgress({ label: "AniListのリストを取得中" });
    try {
      const list = await fetchUserList(name);
      if (!liveRef.current) return;
      const incoming = [];
      const skips = [];
      for (const it of list) {
        const e = mapAniListEntry(it);
        if (e) incoming.push(e);
        else skips.push({ title: titleOf(it.media), reason: "ステータス不明" });
      }
      if (!incoming.length && !skips.length) throw new Error("リストに作品がありません。");
      toPreview(incoming, skips);
    } catch (e) { fail(e); }
  };

  /* テキスト: one AniList search per title, spaced for the rate limit */
  const runText = async () => {
    const all = parseTitleList(text);
    if (!all.length) return;
    const list = all.slice(0, TEXT_CAP);
    setPhase("matching");
    stopRef.current = false;
    const found = [];
    try {
      for (let i = 0; i < list.length; i++) {
        if (!liveRef.current) return;
        if (stopRef.current) break;
        const secs = Math.ceil(((list.length - i) * TEXT_SPACING_MS) / 1000);
        setProgress({ label: "AniListで検索中", n: i + 1, total: list.length, eta: secs });
        if (i > 0) await sleep(TEXT_SPACING_MS);
        let cands = [];
        try { cands = await searchCandidates(list[i].title); } catch (e) {
          if (/rate limit|多すぎ/i.test(e.message)) { await sleep(60000); i--; continue; } // back off, retry
          throw e;
        }
        found.push({ ...list[i], cands, pick: cands.length ? 0 : -1, status: defaultStatus });
      }
      if (!liveRef.current) return;
      setRows(found);
      if (all.length > TEXT_CAP) setSkipped([{ title: `残り${all.length - TEXT_CAP}件`, reason: `1回の上限${TEXT_CAP}件を超えたため未処理` }]);
      else setSkipped([]);
      setPhase("review");
    } catch (e) { fail(e); }
  };

  const finishReview = () => {
    const incoming = [];
    const skips = [...skipped];
    for (const r of rows) {
      const media = r.cands[r.pick];
      if (!media) { skips.push({ title: r.title, reason: r.cands.length ? "除外" : "AniListに該当なし" }); continue; }
      const e = { id: media.id, status: r.status, ...snapshotFields(media) };
      if (r.date && (r.status === "watched" || r.status === "dnf")) e.completedDate = r.date;
      incoming.push(e);
    }
    toPreview(incoming, skips);
  };

  const apply = () => {
    const now = Date.now();
    const list = [
      ...plan.add.map((e) => ({ ...e, updatedAt: now })),
      ...plan.existing
        .filter((x) => !x.same && overwrite[x.incoming.id])
        .map((x) => ({ ...mergeOverwrite(x.current, x.incoming), updatedAt: now })),
    ];
    if (list.length) onApply(list);
    setResult({ added: plan.add.length, updated: list.length - plan.add.length });
    setPhase("done");
  };

  const changed = plan ? plan.existing.filter((x) => !x.same) : [];
  const unchanged = plan ? plan.existing.length - changed.length : 0;
  const setAll = (v) => setOverwrite(v ? Object.fromEntries(changed.map((x) => [x.incoming.id, true])) : {});
  const updateRow = (i, patch) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Modal onClose={onClose} closable={!busy} labelledBy={titleId} className="settings-modal import-modal">
      {!busy && <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>}
      <h2 className="modal-title" id={titleId}>他サービスから取り込む <span className="en-hint">Import watch history</span></h2>

      {phase === "input" && (
        <section className="modal-section">
          <div className="import-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                className={tab === t.key ? "chip active" : "chip"} onClick={() => setTab(t.key)}>
                {t.ja} <span className="en-hint">{t.en}</span>
              </button>
            ))}
          </div>

          {tab === "mal" && (
            <>
              <p className="fine">
                MyAnimeListの「Export」（Profile → Settings → Export Lists → Anime）でダウンロードした
                <b> animelist_….xml.gz </b>をそのまま選んでください（展開した .xml も可）。
                ステータス・評価（10点→★5）・話数・完了日・メモ・再視聴回数を取り込みます。
              </p>
              <button className="toolbar-btn on" onClick={() => fileRef.current?.click()}>ファイルを選ぶ</button>
              <input ref={fileRef} type="file" accept=".xml,.gz,application/xml,application/gzip" hidden
                onChange={(e) => { runMal(e.target.files?.[0]); e.target.value = ""; }} />
            </>
          )}

          {tab === "anilist" && (
            <>
              <p className="fine">
                公開されているAniListのリストをユーザー名で読み込みます（ログイン不要。非公開リストは読めません）。
              </p>
              <form className="import-row" onSubmit={(e) => { e.preventDefault(); runAniList(); }}>
                <input className="settings-input" value={userName} onChange={(e) => setUserName(e.target.value)}
                  placeholder="AniListユーザー名" aria-label="AniListユーザー名" autoComplete="off" />
                <button className="toolbar-btn on" type="submit" disabled={!userName.trim()}>読み込む</button>
              </form>
            </>
          )}

          {tab === "text" && (
            <>
              <p className="fine">
                作品名を1行に1つ貼り付けてください（箇条書き・番号付きもOK）。
                Netflixの視聴履歴CSV（アカウント → 視聴履歴 → ダウンロード）もそのまま貼り付けられます — 話ごとの行は作品単位にまとめ、最後に見た日を完了日にします。
                1件ずつAniListで検索するため、100件で約4分かかります（上限{TEXT_CAP}件）。
              </p>
              <textarea className="memo import-text" rows={8} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"葬送のフリーレン\n・ぼっち・ざ・ろっく！\n…"} aria-label="作品名リスト" />
              <div className="import-row">
                <label className="sort-label">
                  ステータス
                  <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.ja}</option>)}
                  </select>
                </label>
                <span className="fine">{parseTitleList(text).length}件</span>
                <button className="toolbar-btn on" onClick={runText} disabled={!text.trim()}>検索する</button>
              </div>
            </>
          )}
        </section>
      )}

      {phase === "matching" && (
        <section className="modal-section">
          <p className="sync-progress" aria-live="polite">
            {progress?.label}…{progress?.total ? ` ${progress.n} / ${progress.total}` : ""}
            {progress?.eta ? `（残り約${Math.max(1, Math.round(progress.eta / 60))}分）` : ""}
          </p>
          {tab === "text" && (
            <button className="toolbar-btn subtle" onClick={() => { stopRef.current = true; }}>
              ここまでで止める
            </button>
          )}
        </section>
      )}

      {phase === "review" && (
        <section className="modal-section">
          <h4>照合の確認 <span className="en-hint">Check matches</span></h4>
          <p className="fine">候補が違う場合は選び直すか「除外」にしてください。</p>
          <ul className="import-review">
            {rows.map((r, i) => {
              const m = r.cands[r.pick];
              return (
                <li key={i} className="import-item">
                  {m?.coverImage?.large
                    ? <img src={m.coverImage.large} alt="" loading="lazy" />
                    : <div className="cover-empty small">–</div>}
                  <div className="import-body">
                    <span className="sync-soft">入力：{r.title}{r.date ? `（${r.date}）` : ""}</span>
                    <select value={r.pick} onChange={(e) => updateRow(i, { pick: Number(e.target.value) })}
                      aria-label={`${r.title} の照合先`}>
                      {r.cands.map((c, j) => (
                        <option key={c.id} value={j}>
                          {titleOf(c)}{c.seasonYear ? `（${seasonJa(c.season, c.seasonYear)}）` : ""}
                        </option>
                      ))}
                      <option value={-1}>{r.cands.length ? "除外" : "該当なし"}</option>
                    </select>
                    <select value={r.status} onChange={(e) => updateRow(i, { status: e.target.value })}
                      aria-label={`${r.title} のステータス`} disabled={r.pick < 0}>
                      {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.ja}</option>)}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sync-actions">
            <button className="toolbar-btn subtle" onClick={() => setPhase("input")}>戻る</button>
            <button className="toolbar-btn on" onClick={finishReview}>次へ</button>
          </div>
        </section>
      )}

      {phase === "preview" && plan && (
        <section className="modal-section">
          <h4>取り込みプレビュー <span className="en-hint">Preview</span></h4>
          <p className="fine">「取り込む」を押すまで、記録には何も書き込まれません。</p>

          <ListSection label="新規追加" hint="New" count={plan.add.length} defaultOpen>
            {plan.add.map((e) => (
              <li key={e.id} className="sync-item">
                <span className="sync-title">{titleOf(e)}</span>
                <span className="sync-soft">{entryLine(e)}</span>
              </li>
            ))}
          </ListSection>

          <div className="sync-block">
            <div className="sync-head static">
              <span>記録済み・内容が異なる <span className="en-hint">Already tracked</span></span>
              <span className="sync-count"><b>{changed.length}</b>件</span>
            </div>
            {changed.length > 0 && (
              <>
                <div className="sync-bulk">
                  <button className="toolbar-btn subtle" onClick={() => setAll(false)}>すべて今の記録を保持</button>
                  <button className="toolbar-btn subtle" onClick={() => setAll(true)}>すべて上書き</button>
                </div>
                <ul className="sync-list">
                  {changed.map((x) => {
                    const id = x.incoming.id;
                    return (
                      <li key={id} className="sync-conflict">
                        <span className="sync-title">{titleOf(x.current)}</span>
                        <div className="sync-sides">
                          <span className={`sync-side${overwrite[id] ? "" : " win"}`}>今の記録：{entryLine(x.current)}</span>
                          <span className={`sync-side${overwrite[id] ? " win" : ""}`}>取り込み：{entryLine(x.incoming)}</span>
                        </div>
                        <div className="sync-choice">
                          <button className={overwrite[id] ? "chip" : "chip active"}
                            onClick={() => setOverwrite((p) => ({ ...p, [id]: false }))}>保持</button>
                          <button className={overwrite[id] ? "chip active" : "chip"}
                            onClick={() => setOverwrite((p) => ({ ...p, [id]: true }))}>上書き</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <ListSection label="変更なし" hint="Unchanged" count={unchanged}>
            {plan.existing.filter((x) => x.same).map((x) => (
              <li key={x.incoming.id} className="sync-item"><span className="sync-title">{titleOf(x.current)}</span></li>
            ))}
          </ListSection>

          <ListSection label="対象外" hint="Skipped" count={skipped.length}>
            {skipped.map((s, i) => (
              <li key={i} className="sync-item">
                <span className="sync-title">{s.title}</span>
                <span className="sync-soft">{s.reason}</span>
              </li>
            ))}
          </ListSection>

          <p className="fine">上書きしても、取り込み元にない項目（メモなど）は今の記録のまま残ります。</p>
          <div className="sync-actions">
            <button className="toolbar-btn subtle" onClick={onClose}>キャンセル</button>
            {plan.add.length + Object.values(overwrite).filter(Boolean).length > 0 && (
              <button className="toolbar-btn on" onClick={apply}>取り込む</button>
            )}
          </div>
        </section>
      )}

      {phase === "done" && result && (
        <section className="modal-section">
          <p className="sync-summary" role="status">
            追加 {result.added}件 ・ 上書き {result.updated}件 ・ 対象外 {skipped.length}件
          </p>
          <p className="fine">大量に取り込んだあとは「エクスポート」でバックアップしておくと安心です。</p>
          <div className="sync-actions">
            <button className="toolbar-btn on" onClick={onClose}>閉じる</button>
          </div>
        </section>
      )}

      {phase === "error" && (
        <section className="modal-section">
          <p className="sync-fail" role="alert">取り込みに失敗しました：{error}</p>
          <div className="sync-actions">
            <button className="toolbar-btn subtle" onClick={() => setPhase("input")}>戻る</button>
          </div>
        </section>
      )}
    </Modal>
  );
}

export default ImportModal;
