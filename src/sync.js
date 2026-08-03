/* ---------- Annict status sync — pure planning logic ----------
   No network, no storage, no React: takes the local ledger, the annictmap
   cache and a fetched Annict library snapshot, returns a plan. The App layer
   resolves annictmap gaps BEFORE calling buildSyncPlan — an undefined mapping
   here simply lands in `unmapped`. Checked by scripts/check-sync.mjs. */

const STATUS_TO_ANNICT = {
  want: "WANNA_WATCH",
  watching: "WATCHING",
  watched: "WATCHED",
  dnf: "STOP_WATCHING",
};

const ANNICT_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_TO_ANNICT).map(([status, state]) => [state, status])
);

/* buildSyncPlan({ entries, annictMap, library }) →
   { toPush, toPull, conflicts, unmapped, unsupported }
   - entries:   { [anilistId]: Entry } (ledger, HANDOFF §5)
   - annictMap: { [anilistId]: {annictId, id} | {annictId} (old cache) | {none:true} }
   - library:   fetchLibrary() rows { workId, annictId, malAnimeId, title, state, stateChangedAt }
   Conflict proposal: strictly-newer timestamp wins, ties go to remote. Both
   timestamps are approximations (local = entry update time, remote = status
   change time) — the UI discloses this. Remote ON_HOLD / NO_STATE are
   unsupported in v1 (a future 保留 status could map to ON_HOLD). */
function buildSyncPlan({ entries, annictMap, library }) {
  const byAnnict = new Map();
  const byMal = new Map();
  for (const row of library) {
    byAnnict.set(row.annictId, row);
    if (row.malAnimeId != null) byMal.set(String(row.malAnimeId), row);
  }

  const toPush = [];
  const toPull = [];
  const conflicts = [];
  const unmapped = [];
  const unsupported = [];
  const claimed = new Set(); // annictIds accounted for by a local entry

  for (const entry of Object.values(entries)) {
    const workRef = annictMap[entry.id];
    if (!workRef || workRef.none) {
      unmapped.push({ kind: "local", entry });
      continue;
    }
    const remote =
      byAnnict.get(workRef.annictId) ||
      (entry.idMal != null ? byMal.get(String(entry.idMal)) : undefined) ||
      null;
    if (remote) claimed.add(remote.annictId);

    const targetState = STATUS_TO_ANNICT[entry.status];
    if (!targetState) {
      // unknown local status — defensive, cannot be pushed
      unsupported.push({ kind: "local", entry, remote });
      continue;
    }
    if (!remote || remote.state === "NO_STATE") {
      toPush.push({ entry, workRef, targetState });
      continue;
    }
    const remoteStatus = ANNICT_TO_STATUS[remote.state];
    if (remoteStatus === undefined) {
      unsupported.push({ kind: "local", entry, remote });
      continue;
    }
    if (remoteStatus === entry.status) continue; // in sync — nothing to do

    const localT = entry.updatedAt || 0;
    const remoteT = Date.parse(remote.stateChangedAt || "") || 0;
    conflicts.push({ entry, remote, workRef, proposal: localT > remoteT ? "local" : "remote" });
  }

  for (const row of library) {
    if (claimed.has(row.annictId)) continue;
    if (ANNICT_TO_STATUS[row.state] === undefined) {
      unsupported.push({ kind: "remote", remote: row });
      continue;
    }
    if (row.malAnimeId == null) {
      unmapped.push({ kind: "remote", remote: row }); // no MAL id → can't join to AniList
      continue;
    }
    toPull.push({
      annictId: row.annictId,
      workId: row.workId,
      malAnimeId: row.malAnimeId,
      title: row.title,
      state: row.state,
    });
  }

  return { toPush, toPull, conflicts, unmapped, unsupported };
}

export { STATUS_TO_ANNICT, ANNICT_TO_STATUS, buildSyncPlan };
