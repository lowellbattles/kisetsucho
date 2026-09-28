/* ---------- ledger export format + import migration ----------
   Pure logic (no React, no storage) — checked by scripts/check-ledger.mjs.
   Export payload: { app: "kisetsucho", version, exportedAt, entries }.
   Version history:
     v4 — chat-era format; statuses want / watching / watched / dnf.
     v5 — adds the `hold` (保留) status and optional snapshot fields
          `studios`, `genres`, `titleKana`. No field renames, so v4 → v5
          needs no rewriting; the dispatch below is where future
          migrations hook in. Import also accepts a bare entries map. */

import { STATUSES } from "./constants.js";

const EXPORT_VERSION = 5;
const VALID_STATUS = new Set(STATUSES.map((s) => s.key));

/* per-version upgrade steps: MIGRATIONS[n] turns a vN entry into v(n+1) */
const MIGRATIONS = {
  4: (e) => e, // v4 → v5: additive only
};

function buildExport(entries, now = new Date()) {
  return { app: "kisetsucho", version: EXPORT_VERSION, exportedAt: now.toISOString(), entries };
}

/* migrateImport(parsedJson) →
   { entries, skipped, fromVersion, newer }
   - entries:     { [id]: Entry } upgraded to the current version
   - skipped:     count of entries dropped (no numeric id / unknown status)
   - fromVersion: file version (bare maps are treated as v4)
   - newer:       true when the file comes from a newer app version
   Throws on input that isn't an entries object at all. */
function migrateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("not an object");
  const wrapped = data.app === "kisetsucho" || (data.entries && typeof data.entries === "object");
  const raw = wrapped ? data.entries : data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("no entries");
  const fromVersion = wrapped && Number.isInteger(data.version) ? data.version : 4;

  const entries = {};
  let skipped = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") { skipped++; continue; }
    let e = value;
    for (let v = fromVersion; v < EXPORT_VERSION; v++) if (MIGRATIONS[v]) e = MIGRATIONS[v](e);
    const id = Number(e.id ?? key); // map key is the AniList id too
    if (!Number.isFinite(id) || !VALID_STATUS.has(e.status)) { skipped++; continue; }
    entries[id] = { ...e, id };
  }
  return { entries, skipped, fromVersion, newer: fromVersion > EXPORT_VERSION };
}

export { EXPORT_VERSION, buildExport, migrateImport };
