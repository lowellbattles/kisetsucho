/* Export/import migration fixture check (pure logic, no network, no deps).
   Gates CLAUDE.md verification step 4 — "a pre-change export file still
   imports cleanly" — for every export version the app has shipped.
   Usage: node scripts/check-ledger.mjs */
import { EXPORT_VERSION, buildExport, migrateImport } from "../src/ledger.js";
import { toHiragana, kanaSortInfo, compareKana } from "../src/kana.js";

let bad = 0;
let total = 0;
const check = (name, cond) => {
  total++;
  if (!cond) {
    bad++;
    console.error("FAIL", name);
  }
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

/* a realistic v4 export (chat-era format, as produced by the v4 app) */
const v4 = {
  app: "kisetsucho",
  version: 4,
  exportedAt: "2026-07-01T00:00:00.000Z",
  entries: {
    101: {
      id: 101, status: "watched", title: { native: "葬送のフリーレン", romaji: "Sousou no Frieren" },
      cover: "https://example.invalid/c.jpg", format: "TV", season: "FALL", seasonYear: 2023,
      episodes: 28, rating: 4.5, completedDate: "2024-03-22", progress: 28, rewatchCount: 1,
      memo: "最高", updatedAt: 1711065600000,
    },
    102: { id: 102, status: "watching", progress: 3, episodes: 12, updatedAt: 1 },
    103: { id: 103, status: "want", updatedAt: 1 },
    104: { id: 104, status: "dnf", completedDate: "2025-01-02", updatedAt: 1 },
  },
};

const r4 = migrateImport(JSON.parse(JSON.stringify(v4)));
check("v4: all four entries import", Object.keys(r4.entries).length === 4 && r4.skipped === 0);
check("v4: fromVersion detected", r4.fromVersion === 4 && !r4.newer);
check("v4: fields preserved verbatim",
  JSON.stringify(r4.entries[101]) === JSON.stringify(v4.entries[101]));

const bare = migrateImport({ 5: { id: 5, status: "want" }, 6: { status: "watched" } });
check("bare map accepted as v4", bare.fromVersion === 4 && Object.keys(bare.entries).length === 2);
check("bare map: id falls back to the map key", bare.entries[6]?.id === 6);

const v5 = buildExport({
  201: { id: 201, status: "hold", progress: 5, studios: ["MAPPA"], genres: ["Action"], titleKana: "じゅじゅつかいせん" },
}, new Date("2026-09-28T00:00:00Z"));
check("buildExport stamps the current version", v5.version === EXPORT_VERSION && EXPORT_VERSION === 5);
check("buildExport shape", v5.app === "kisetsucho" && v5.exportedAt === "2026-09-28T00:00:00.000Z");
const r5 = migrateImport(JSON.parse(JSON.stringify(v5)));
check("v5: 保留 entry + optional fields round-trip",
  r5.entries[201]?.status === "hold" && r5.entries[201]?.titleKana === "じゅじゅつかいせん" &&
  r5.entries[201]?.studios?.[0] === "MAPPA" && r5.skipped === 0);

const future = migrateImport({
  app: "kisetsucho", version: 99,
  entries: { 1: { id: 1, status: "watched" }, 2: { id: 2, status: "someday" } },
});
check("newer file: flagged, known entries kept, unknown status skipped",
  future.newer && future.entries[1] && !future.entries[2] && future.skipped === 1);

const junk = migrateImport({
  app: "kisetsucho", version: 4,
  entries: { a: { id: "abc", status: "want" }, 7: null, 8: { id: 8 } },
});
check("malformed entries skipped, not merged", Object.keys(junk.entries).length === 0 && junk.skipped === 3);

check("non-object input rejected", throws(() => migrateImport(null)) && throws(() => migrateImport([1, 2])));
check("wrapped file without entries rejected", throws(() => migrateImport({ app: "kisetsucho", version: 5 })));

/* kana-aware タイトル順 (src/kana.js) */
const t = (native, titleKana) => ({ title: { native }, ...(titleKana !== undefined ? { titleKana } : {}) });
check("toHiragana normalizes katakana", toHiragana("カタカナ・ヴ") === "かたかな・ゔ");
check("row from Annict reading", kanaSortInfo(t("進撃の巨人", "しんげきのきょじん")).row === "さ行");
check("voiced kana share their row", kanaSortInfo(t("ガンダム")).row === "か行");
check("kana-leading native needs no reading", kanaSortInfo(t("やがて君になる")).row === "や行");
check("kanji without reading → 読み未取得", kanaSortInfo(t("葬送のフリーレン")).row === "読み未取得");
check("latin-leading → 英数字・記号", kanaSortInfo(t("SPY×FAMILY")).row === "英数字・記号");
const sorted = [
  t("葬送のフリーレン"), t("SPY×FAMILY"), t("進撃の巨人", "しんげきのきょじん"),
  t("ガンダム"), t("青の祓魔師", "あおのえくそしすと"),
].sort(compareKana).map((e) => e.title.native).join(",");
check("五十音 rows, then 英数字, then unread",
  sorted === "青の祓魔師,ガンダム,進撃の巨人,SPY×FAMILY,葬送のフリーレン");

console.log(`ledger: ${total - bad}/${total} migration + kana checks OK`);
if (bad) process.exit(1);
