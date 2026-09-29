import { useState, useEffect, useRef, useId } from "react";
import Modal from "./Modal.jsx";
import SyncSection from "./ListSection.jsx";
import { STATUSES } from "../constants.js";
import { fetchWorkMeta, resolveAnnictMapGaps, fetchLibrary, pushStatus } from "../api/annict.js";
import { fetchMediaByMalIds } from "../api/anilist.js";
import { snapshotFields } from "../utils.js";
import { buildSyncPlan, STATUS_TO_ANNICT, ANNICT_TO_STATUS } from "../sync.js";

/* ---------- Annict two-way status sync (HANDOFF §10.1 write features) ----------
   Explicit opt-in: opens only from the 記録 view button, nothing is automatic.
   Phase machine: 準備中 (fill annictmap gaps + fetch the remote library —
   cache-only writes, same contract as opening detail modals) → プレビュー
   (nothing else is written anywhere until 実行) → 実行中 (sequential pushes
   with spacing, then pulls applied in one batch) → 完了. Conflict rule:
   most-recent-timestamp proposal, overridable per item (HANDOFF §10.1). */

const STATUS_JA = Object.fromEntries(STATUSES.map((s) => [s.key, s.ja]));
/* Annict StatusState → JA label via the local status labels, plus NO_STATE
   which has no local counterpart (FORMAT_JA-style label map). */
const STATE_JA = {
  ...Object.fromEntries(
    Object.entries(ANNICT_TO_STATUS).map(([state, key]) => [state, STATUS_JA[key]])
  ),
  NO_STATE: "未設定",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const entryTitle = (e) => e.title?.native || e.title?.romaji || e.title?.english || `#${e.id}`;

function fmtDate(t) {
  if (!t) return "日時不明";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  return Number.isNaN(d.getTime())
    ? "日時不明"
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function SyncModal({ entries, annictMap, token, onMap, onApplyPull, onSnapshot, onClose }) {
  const [phase, setPhase] = useState("prepare"); // prepare | preview | running | done | error
  const [progress, setProgress] = useState(null); // { label, n, total } — null total = indeterminate
  const [plan, setPlan] = useState(null);
  const [choices, setChoices] = useState({}); // conflict entry.id → "local" | "remote"
  const [result, setResult] = useState(null); // { pushed, pulled, failures, misses }
  const [error, setError] = useState(null);
  const titleId = useId();
  /* Guards a user-triggered run() against unmount mid-flight. The body reset
     matters: StrictMode mounts → cleans up → remounts the same instance, and
     without re-setting true the flag would stay false forever after remount. */
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => { liveRef.current = false; };
  }, []);

  /* phase a — 準備中: resolve annictmap gaps, backfill global ids, fetch library.
     Per-run local `live` flag (house pattern — see TmdbSection): StrictMode's
     first dev run cancels at its next checkpoint, the remount's run completes. */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const local = Object.values(entries);
        const resolved = await resolveAnnictMapGaps(local, annictMap, token, {
          onMap, onProgress: setProgress, isLive: () => live,
        });
        if (!resolved) return;

        // old annictmap entries ({annictId} without the relay global id) → bulk
        // backfill; the same request brings titleKana for the ledger kana sort
        const stale = local.filter((e) => resolved[e.id]?.annictId && !resolved[e.id].id);
        if (stale.length) {
          setProgress({ label: "作品IDを解決中", n: null, total: null });
          const meta = await fetchWorkMeta(
            [...new Set(stale.map((e) => resolved[e.id].annictId))], token);
          for (const e of stale) {
            const w = meta.get(resolved[e.id].annictId);
            if (!w) continue;
            const m = { annictId: resolved[e.id].annictId, id: w.id };
            resolved[e.id] = m;
            onMap(e.id, m);
            if (w.titleKana && !e.titleKana) onSnapshot?.(e.id, { titleKana: w.titleKana });
          }
        }

        setProgress({ label: "Annictライブラリを取得中", n: null, total: null });
        const library = await fetchLibrary(token);
        if (!live) return;

        const p = buildSyncPlan({ entries, annictMap: resolved, library });
        const init = {};
        for (const c of p.conflicts) init[c.entry.id] = c.proposal;
        setPlan(p);
        setChoices(init);
        setPhase("preview");
      } catch (e) {
        if (live) { setError(e.message); setPhase("error"); }
      }
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line -- mount-only: props are stable while the modal is open

  /* phase c — 実行中: pushes first (sequential, spaced), then pulls in one batch. */
  const run = async () => {
    setPhase("running");
    const failures = [];
    const misses = [];
    let pushed = 0;
    let pulled = 0;
    const localWins = plan.conflicts.filter((c) => choices[c.entry.id] !== "remote");
    const remoteWins = plan.conflicts.filter((c) => choices[c.entry.id] === "remote");

    // ローカル → Annict
    const pushItems = [
      ...plan.toPush.map((t) => ({
        entry: t.entry, workId: t.workRef?.id, targetState: t.targetState,
      })),
      ...localWins.map((c) => ({
        entry: c.entry,
        workId: c.workRef?.id || c.remote?.workId,
        targetState: STATUS_TO_ANNICT[c.entry.status],
      })),
    ];
    for (let i = 0; i < pushItems.length; i++) {
      if (!liveRef.current) return;
      setProgress({ label: "送信中", n: i + 1, total: pushItems.length });
      const it = pushItems[i];
      try {
        if (i > 0) await sleep(400);
        if (!it.workId) throw new Error("Annictの作品IDを解決できませんでした");
        await pushStatus(it.workId, it.targetState, token);
        pushed++;
      } catch (e) {
        failures.push({ title: entryTitle(it.entry), message: e.message }); // collect, keep going
      }
    }

    // Annict → ローカル
    const updates = [];
    for (const c of remoteWins) {
      // entry already exists locally — overwrite its status only, no AniList fetch
      const status = ANNICT_TO_STATUS[c.remote.state];
      if (!status) continue; // defensive — unsupported states never reach conflicts
      updates.push({ ...c.entry, status, updatedAt: Date.now() });
      pulled++;
    }
    if (plan.toPull.length) {
      setProgress({ label: "AniListと照合中", n: null, total: null });
      try {
        const malIds = plan.toPull
          .map((r) => parseInt(r.malAnimeId, 10))
          .filter((n) => Number.isFinite(n));
        const mediaByMal = await fetchMediaByMalIds(malIds);
        for (const r of plan.toPull) {
          const media = mediaByMal.get(parseInt(r.malAnimeId, 10));
          if (!media) {
            misses.push({ title: r.title, message: "AniListに該当作品が見つかりません" });
            continue;
          }
          const existing = entries[media.id];
          updates.push(
            existing
              ? { ...existing, status: ANNICT_TO_STATUS[r.state], updatedAt: Date.now() } // stale-map safety: never clobber fields
              : {
                  id: media.id,
                  status: ANNICT_TO_STATUS[r.state],
                  ...snapshotFields(media),
                  ...(r.titleKana ? { titleKana: r.titleKana } : {}),
                  updatedAt: Date.now(),
                }
          );
          onMap(media.id, { annictId: r.annictId, id: r.workId });
          pulled++;
        }
      } catch (e) {
        failures.push({ title: "取り込み", message: e.message });
      }
    }
    if (!liveRef.current) return;
    if (updates.length) onApplyPull(updates);

    setResult({ pushed, pulled, failures, misses });
    setPhase("done");
  };

  const setAllChoices = (side) => {
    const next = {};
    for (const c of plan.conflicts) next[c.entry.id] = side;
    setChoices(next);
  };

  const pendingReason = (u) =>
    u.kind === "local" ? "Annictに該当なし" : "MAL ID未登録（AniListと照合不可）";
  const closable = phase !== "running";
  const workCount = plan
    ? plan.toPush.length + plan.toPull.length + plan.conflicts.length
    : 0;
  const skippedCount = plan ? plan.unmapped.length + plan.unsupported.length : 0;
  const progressLine = progress
    ? `${progress.label}…${progress.total ? ` ${progress.n} / ${progress.total}` : ""}`
    : "準備中…";

  return (
    <Modal onClose={onClose} closable={closable} labelledBy={titleId} className="settings-modal">
        {closable && <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>}
        <h2 className="modal-title" id={titleId}>Annictと同期 <span className="en-hint">Annict Sync</span></h2>

        {phase === "prepare" && (
          <section className="modal-section">
            <p className="sync-progress" aria-live="polite">{progressLine}</p>
            <p className="fine">
              初回はローカルの記録とAnnict作品の照合に時間がかかることがあります（1件ずつ照会）。
            </p>
          </section>
        )}

        {phase === "error" && (
          <section className="modal-section">
            <p className="sync-fail">同期の準備に失敗しました：{error}</p>
            <div className="sync-actions">
              <button className="toolbar-btn subtle" onClick={onClose}>閉じる</button>
            </div>
          </section>
        )}

        {phase === "preview" && plan && (
          <section className="modal-section">
            <h4>同期プレビュー <span className="en-hint">Preview</span></h4>
            <p className="fine">「同期を実行」を押すまで、ローカル・Annictどちらにも何も書き込まれません。</p>

            <SyncSection label="送信（ローカル→Annict）" hint="Push" count={plan.toPush.length} defaultOpen>
              {plan.toPush.map((t) => (
                <li key={t.entry.id} className="sync-item">
                  <span className="sync-title">{entryTitle(t.entry)}</span>
                  <span className="sync-soft">{STATUS_JA[t.entry.status]} → Annict</span>
                </li>
              ))}
            </SyncSection>

            <SyncSection label="取り込み（Annict→ローカル）" hint="Pull" count={plan.toPull.length} defaultOpen>
              {plan.toPull.map((r) => (
                <li key={r.annictId} className="sync-item">
                  <span className="sync-title">{r.title}</span>
                  <span className="sync-soft">Annict → {STATE_JA[r.state]}</span>
                </li>
              ))}
            </SyncSection>

            <div className="sync-block">
              <div className="sync-head static">
                <span>競合 <span className="en-hint">Conflicts</span></span>
                <span className="sync-count"><b>{plan.conflicts.length}</b>件</span>
              </div>
              {plan.conflicts.length > 0 && (
                <>
                  <div className="sync-bulk">
                    <button className="toolbar-btn subtle" onClick={() => setAllChoices("local")}>すべてローカル優先</button>
                    <button className="toolbar-btn subtle" onClick={() => setAllChoices("remote")}>すべてAnnict優先</button>
                  </div>
                  <ul className="sync-list">
                    {plan.conflicts.map((c) => (
                      <li key={c.entry.id} className="sync-conflict">
                        <span className="sync-title">{entryTitle(c.entry)}</span>
                        <div className="sync-sides">
                          <span className={`sync-side${choices[c.entry.id] === "local" ? " win" : ""}`}>
                            ローカル：{STATUS_JA[c.entry.status]}（{fmtDate(c.entry.updatedAt)}）
                          </span>
                          <span className={`sync-side${choices[c.entry.id] === "remote" ? " win" : ""}`}>
                            Annict：{STATE_JA[c.remote.state]}（{fmtDate(c.remote.stateChangedAt)}）
                          </span>
                        </div>
                        <div className="sync-choice">
                          <button
                            className={choices[c.entry.id] === "local" ? "chip active" : "chip"}
                            onClick={() => setChoices((prev) => ({ ...prev, [c.entry.id]: "local" }))}
                          >
                            ローカル
                          </button>
                          <button
                            className={choices[c.entry.id] === "remote" ? "chip active" : "chip"}
                            onClick={() => setChoices((prev) => ({ ...prev, [c.entry.id]: "remote" }))}
                          >
                            Annict
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <SyncSection label="未対応" hint="Skipped" count={skippedCount}>
              {plan.unmapped.map((u, i) => (
                <li key={`um${i}`} className="sync-item">
                  <span className="sync-title">
                    {u.kind === "local" ? entryTitle(u.entry) : u.remote?.title || "?"}
                  </span>
                  <span className="sync-soft">{pendingReason(u)}</span>
                </li>
              ))}
              {plan.unsupported.map((u, i) => (
                <li key={`us${i}`} className="sync-item">
                  <span className="sync-title">
                    {u.kind === "local" ? entryTitle(u.entry) : u.remote?.title || "?"}
                  </span>
                  <span className="sync-soft">
                    {STATE_JA[u.remote?.state] || u.remote?.state}（このステータスは未対応）
                  </span>
                </li>
              ))}
            </SyncSection>

            <p className="fine">日時は目安です（ローカルは項目更新時刻、Annictはステータス変更時刻）。</p>
            {workCount === 0 && <p className="fine">すべて同期済みです。実行できる項目はありません。</p>}
            <div className="sync-actions">
              <button className="toolbar-btn subtle" onClick={onClose}>キャンセル</button>
              {workCount > 0 && (
                <button className="toolbar-btn on" onClick={run}>同期を実行</button>
              )}
            </div>
          </section>
        )}

        {phase === "running" && (
          <section className="modal-section">
            <p className="sync-progress" aria-live="polite">{progressLine}</p>
            <p className="fine">実行中はこの画面を閉じられません。</p>
          </section>
        )}

        {phase === "done" && result && (
          <section className="modal-section">
            <p className="sync-summary" role="status">
              送信 {result.pushed}件 ・ 取り込み {result.pulled}件 ・ 失敗 {result.failures.length}件 ・ 未対応 {skippedCount + result.misses.length}件
            </p>
            {result.failures.map((f, i) => (
              <p key={`f${i}`} className="sync-fail">{f.title}：{f.message}</p>
            ))}
            {result.misses.map((f, i) => (
              <p key={`m${i}`} className="fine">{f.title}：{f.message}</p>
            ))}
            <div className="sync-actions">
              <button className="toolbar-btn on" onClick={onClose}>閉じる</button>
            </div>
          </section>
        )}
    </Modal>
  );
}

export default SyncModal;
