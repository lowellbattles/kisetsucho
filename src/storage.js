const STORE_KEY = "kisetsucho:entries";
const SETTINGS_KEY = "kisetsucho:settings";
const TMDBMAP_KEY = "kisetsucho:tmdbmap";
const ANNICTMAP_KEY = "kisetsucho:annictmap";

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

export { STORE_KEY, SETTINGS_KEY, TMDBMAP_KEY, ANNICTMAP_KEY, storageGetJson, storageSetJson };
