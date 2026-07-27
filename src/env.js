/* Default TMDB key comes from .env.local via window.KISETSUCHO_ENV (set in main.jsx).
   Must be read lazily inside App: the global is assigned after this module evaluates,
   and import.meta can't be used here — the standalone build (§8) is a non-module script. */
const defaultTmdbKey = () => window.KISETSUCHO_ENV?.tmdbKey || "";

export { defaultTmdbKey };
