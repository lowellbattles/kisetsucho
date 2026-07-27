import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/* ------------------------------------------------------------------
   window.storage shim — the persistence seam for 季節帳 (HANDOFF.md §5).
   Same contract as the Claude.ai artifact storage API, backed by
   localStorage on the stable localhost / deployed origin.
   Keep this abstraction: it is where a future backend (Annict sync,
   file persistence) plugs in without touching App.jsx.
------------------------------------------------------------------- */
window.storage = window.storage || {
  async get(key) {
    const v = localStorage.getItem(key);
    if (v === null) throw new Error("key not found");
    return { key, value: v, shared: false };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix = "") {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};

/* P0 roadmap item (HANDOFF.md §10): once DEFAULT_TMDB_KEY is removed from
   App.jsx, the env var becomes the default key source. Set VITE_TMDB_KEY in
   .env.local (gitignored). Until App.jsx reads import.meta.env directly,
   this global lets the transition happen in either order. */
window.KISETSUCHO_ENV = {
  tmdbKey: import.meta.env.VITE_TMDB_KEY || "",
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
