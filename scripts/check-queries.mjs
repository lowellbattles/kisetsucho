/* HANDOFF §9.2 — query-builder brace balance across all 26 combinations
   (24 browse: 3 scopes × formats × genres × adult, + 2 search: adult on/off).
   Usage: node scripts/check-queries.mjs */
import { buildBrowseQuery, buildSearchQuery } from "../src/api/anilist.js";

let bad = 0;
let total = 0;
const balanced = (q) => (q.match(/{/g) || []).length === (q.match(/}/g) || []).length;

for (const scope of ["season", "year", "decade"])
  for (const useFormats of [true, false])
    for (const useGenres of [true, false])
      for (const hideAdult of [true, false]) {
        total++;
        const q = buildBrowseQuery(scope, { useFormats, useGenres, hideAdult });
        if (!balanced(q)) {
          bad++;
          console.error("UNBALANCED browse", scope, JSON.stringify({ useFormats, useGenres, hideAdult }));
        }
      }

for (const hideAdult of [true, false]) {
  total++;
  const q = buildSearchQuery({ hideAdult });
  if (!balanced(q)) {
    bad++;
    console.error("UNBALANCED search", JSON.stringify({ hideAdult }));
  }
}

console.log(`brace-balance: ${total - bad}/${total} combinations OK`);
if (bad) process.exit(1);
