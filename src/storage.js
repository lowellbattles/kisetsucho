const STORE_KEY = "kisetsucho:entries";
const SETTINGS_KEY = "kisetsucho:settings";
const TMDBMAP_KEY = "kisetsucho:tmdbmap";
const ANNICTMAP_KEY = "kisetsucho:annictmap";
const LASTEXPORT_KEY = "kisetsucho:lastexport";     // Date.now() of last エクスポート
const BACKUPSNOOZE_KEY = "kisetsucho:backupsnooze"; // Date.now() of last 後で on the backup nudge
const THEMES_KEY = "kisetsucho:themes";             // 主題歌 cache (api/animethemes.js) — device-only, not exported

/* ---------- persistence ---------- */

async function storageGetJson(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch {
    return fallback;
  }
}

async function storageSetJson(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value));
  } catch (e) {
    console.error("save failed", e);
  }
}

export {
  STORE_KEY, SETTINGS_KEY, TMDBMAP_KEY, ANNICTMAP_KEY, LASTEXPORT_KEY, BACKUPSNOOZE_KEY, THEMES_KEY,
  storageGetJson, storageSetJson,
};
