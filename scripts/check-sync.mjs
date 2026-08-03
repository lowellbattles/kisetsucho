/* Track A — buildSyncPlan fixture check (pure logic, no network, no deps).
   Feeds one combined scenario covering push / pull / conflict-each-direction /
   unmapped (local + remote) / unsupported, and exits non-zero on any mismatch.
   Usage: node scripts/check-sync.mjs */
import { buildSyncPlan, STATUS_TO_ANNICT, ANNICT_TO_STATUS } from "../src/sync.js";

let bad = 0;
let total = 0;
const check = (name, cond) => {
  total++;
  if (!cond) {
    bad++;
    console.error("FAIL", name);
  }
};

const row = (over) => ({
  workId: "V29yaw==",
  annictId: 0,
  malAnimeId: null,
  title: "作品",
  state: "WATCHING",
  stateChangedAt: "2026-06-01T00:00:00Z",
  ...over,
});

const entries = {
  10: { id: 10, status: "watched", updatedAt: Date.parse("2026-07-01") },  // → push (no remote row)
  11: { id: 11, status: "watching", updatedAt: Date.parse("2026-07-01") }, // in sync → nothing
  12: { id: 12, status: "watched", updatedAt: Date.parse("2026-07-01") },  // conflict, local newer
  13: { id: 13, status: "watched", updatedAt: Date.parse("2026-05-01") },  // conflict, remote newer (old map shape)
  14: { id: 14, status: "want", updatedAt: 1 },                            // unmapped ({none:true} cached)
  15: { id: 15, status: "want", updatedAt: 1 },                            // unmapped (no map entry)
  16: { id: 16, status: "want", updatedAt: 1 },                            // → push (remote NO_STATE)
  17: { id: 17, status: "watching", updatedAt: 1 },                        // unsupported (remote ON_HOLD)
};

const annictMap = {
  10: { annictId: 210, id: "W210" },
  11: { annictId: 211, id: "W211" },
  12: { annictId: 212, id: "W212" },
  13: { annictId: 213 }, // old cache entry without the relay global id — must still plan
  14: { none: true },
  16: { annictId: 216, id: "W216" },
  17: { annictId: 217, id: "W217" },
};

const library = [
  row({ annictId: 211, malAnimeId: "1211", workId: "W211", state: "WATCHING" }),
  row({ annictId: 212, malAnimeId: "1212", workId: "W212", state: "WATCHING", stateChangedAt: "2026-06-01T00:00:00Z" }),
  row({ annictId: 213, malAnimeId: "1213", workId: "W213", state: "WATCHING", stateChangedAt: "2026-06-01T00:00:00Z" }),
  row({ annictId: 216, malAnimeId: "1216", workId: "W216", state: "NO_STATE" }),
  row({ annictId: 217, malAnimeId: "1217", workId: "W217", state: "ON_HOLD" }),
  row({ annictId: 300, malAnimeId: "1300", workId: "W300", state: "WANNA_WATCH", title: "取り込み対象" }), // → pull
  row({ annictId: 301, malAnimeId: null, workId: "W301", state: "WATCHED" }),   // unmapped (no MAL id)
  row({ annictId: 302, malAnimeId: "1302", workId: "W302", state: "ON_HOLD" }), // unsupported
];

const plan = buildSyncPlan({ entries, annictMap, library });
const ids = (list) => list.map((x) => x.entry?.id ?? x.remote?.annictId ?? x.annictId).sort((a, b) => a - b).join(",");

check("status maps are total inverses",
  Object.keys(STATUS_TO_ANNICT).length === 4 &&
  Object.keys(ANNICT_TO_STATUS).length === 4 &&
  Object.entries(STATUS_TO_ANNICT).every(([k, v]) => ANNICT_TO_STATUS[v] === k));

check("push: local-only entry + NO_STATE remote", ids(plan.toPush) === "10,16");
check("push: carries workRef and mapped state",
  plan.toPush.every((t) => t.workRef?.id && t.targetState === STATUS_TO_ANNICT[t.entry.status]));

check("pull: remote-only supported row", ids(plan.toPull) === "300");
check("pull: carries join fields",
  plan.toPull[0]?.workId === "W300" && plan.toPull[0]?.malAnimeId === "1300" &&
  plan.toPull[0]?.state === "WANNA_WATCH" && plan.toPull[0]?.title === "取り込み対象");

check("conflicts: both directions detected", ids(plan.conflicts) === "12,13");
check("conflict local-newer proposes local",
  plan.conflicts.find((c) => c.entry.id === 12)?.proposal === "local");
check("conflict remote-newer proposes remote",
  plan.conflicts.find((c) => c.entry.id === 13)?.proposal === "remote");
check("conflict tolerates old map shape (no global id)",
  plan.conflicts.find((c) => c.entry.id === 13)?.remote.workId === "W213");

check("unmapped: {none:true}, missing map, MAL-less remote", ids(plan.unmapped) === "14,15,301");
check("unsupported: remote ON_HOLD (matched + unmatched)", ids(plan.unsupported) === "17,302");
check("in-sync entry produces no work",
  ![...plan.toPush, ...plan.conflicts].some((x) => x.entry.id === 11));

console.log(`sync-plan: ${total - bad}/${total} fixture checks OK`);
if (bad) process.exit(1);
