/* 他サービスから取り込む — fixture check for src/importers.js (pure logic,
   no network, no deps). Usage: node scripts/check-import.mjs */
import {
  parseMalXml, mapMalRow, mapAniListEntry, parseTitleList, planImport, mergeOverwrite,
  malDate, looseDate, showName,
} from "../src/importers.js";

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

/* ---------- MyAnimeList export (documented flat format) ---------- */
const MAL = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_id>1</user_id><user_name>example</user_name><user_export_type>1</user_export_type></myinfo>
  <anime>
    <series_animedb_id>52991</series_animedb_id>
    <series_title><![CDATA[Sousou no Frieren]]></series_title>
    <series_type>TV</series_type>
    <series_episodes>28</series_episodes>
    <my_watched_episodes>28</my_watched_episodes>
    <my_start_date>2023-09-29</my_start_date>
    <my_finish_date>2024-03-00</my_finish_date>
    <my_score>10</my_score>
    <my_status>Completed</my_status>
    <my_comments><![CDATA[最高 & 泣いた <3]]></my_comments>
    <my_times_watched>1</my_times_watched>
  </anime>
  <anime>
    <series_animedb_id>21</series_animedb_id>
    <series_title>One Piece &amp; friends</series_title>
    <my_watched_episodes>0</my_watched_episodes>
    <my_finish_date>0000-00-00</my_finish_date>
    <my_score>0</my_score>
    <my_status>Plan to Watch</my_status>
    <my_comments/>
  </anime>
  <anime>
    <series_animedb_id>5114</series_animedb_id>
    <series_title><![CDATA[Fullmetal Alchemist: Brotherhood]]></series_title>
    <my_watched_episodes>30</my_watched_episodes>
    <my_score>7</my_score>
    <my_status>3</my_status>
  </anime>
  <anime>
    <series_animedb_id>1</series_animedb_id>
    <my_status>Dropped</my_status>
    <my_finish_date>2020-05-17</my_finish_date>
  </anime>
</myanimelist>`;

const rows = parseMalXml(MAL);
check("MAL: all four rows parsed", rows.length === 4);
check("MAL: word status Completed → watched", rows[0].status === "watched");
check("MAL: Plan to Watch → want", rows[1].status === "want");
check("MAL: numeric status 3 → hold", rows[2].status === "hold");
check("MAL: Dropped → dnf", rows[3].status === "dnf");
check("MAL: CDATA comments kept verbatim", rows[0].comments === "最高 & 泣いた <3");
check("MAL: entity-decoded title", rows[1].title === "One Piece & friends");
check("MAL: missing day → 1st of month", rows[0].finishDate === "2024-03-01");
check("MAL: 0000-00-00 → no date", rows[1].finishDate === undefined);
check("MAL: self-closing tag → empty", rows[1].comments === "");
check("non-MAL input rejected", throws(() => parseMalXml("<html></html>")));

const media = {
  id: 154587, title: { native: "葬送のフリーレン" }, coverImage: { large: "c.jpg" },
  format: "TV", season: "FALL", seasonYear: 2023, episodes: 28,
  studios: { nodes: [{ name: "MADHOUSE" }] }, genres: ["Adventure"],
};
const e0 = mapMalRow(rows[0], media);
check("MAL map: AniList id + snapshot",
  e0.id === 154587 && e0.title.native === "葬送のフリーレン" && e0.studios[0] === "MADHOUSE");
check("MAL map: 10 → ★5.0, progress, rewatch, memo",
  e0.rating === 5 && e0.progress === 28 && e0.rewatchCount === 1 && e0.memo === "最高 & 泣いた <3");
check("MAL map: completion date only for watched/dnf", e0.completedDate === "2024-03-01");
const e1 = mapMalRow(rows[1], { id: 21, title: { native: "ONE PIECE" } });
check("MAL map: score 0 → unrated, no empty fields",
  e1.rating === undefined && e1.progress === undefined && e1.memo === undefined && e1.completedDate === undefined);
check("MAL map: 7 → ★3.5", mapMalRow(rows[2], { id: 5114 }).rating === 3.5);

/* ---------- AniList list entry ---------- */
const al = mapAniListEntry({
  status: "COMPLETED", score: 8.7, progress: 12, repeat: 2, notes: " いい ",
  completedAt: { year: 2025, month: 6, day: null }, media: { id: 1, title: { native: "作品" } },
});
check("AniList: COMPLETED → watched, 8.7 → ★4.5",
  al.status === "watched" && al.rating === 4.5);
check("AniList: progress, repeat, trimmed notes, partial date",
  al.progress === 12 && al.rewatchCount === 2 && al.memo === "いい" && al.completedDate === "2025-06-01");
check("AniList: PAUSED → hold, REPEATING → watching",
  mapAniListEntry({ status: "PAUSED", media: { id: 2 } }).status === "hold" &&
  mapAniListEntry({ status: "REPEATING", media: { id: 3 } }).status === "watching");
check("AniList: tiny score still ★0.5 minimum", mapAniListEntry({ status: "COMPLETED", score: 0.4, media: { id: 4 } }).rating === 0.5);
check("AniList: unknown status → null", mapAniListEntry({ status: "WHATEVER", media: { id: 5 } }) === null);

/* ---------- pasted lists / Netflix CSV ---------- */
const pasted = parseTitleList(`
・葬送のフリーレン
1. 進撃の巨人
✓ SPY×FAMILY
- 葬送のフリーレン
(2) ぼっち・ざ・ろっく！
`);
check("list: bullets/numbering stripped, deduped",
  pasted.map((x) => x.title).join("|") === "葬送のフリーレン|進撃の巨人|SPY×FAMILY|ぼっち・ざ・ろっく！");

const netflix = parseTitleList(`﻿Title,Date
"葬送のフリーレン: シーズン1: 旅立ち","2024/3/1"
"葬送のフリーレン: シーズン1: 魂の眠る地","2024/3/22"
"SPY×FAMILY: Season 2: Episode 3","10/21/23"
"呪術廻戦: 第2期: 懐玉","2023/8/1"
"すずめの戸締まり","2024/1/5"`);
check("netflix: episodes collapse to shows", netflix.length === 4);
check("netflix: latest date kept",
  netflix.find((x) => x.title === "葬送のフリーレン")?.date === "2024-03-22");
check("netflix: EN season split + US date",
  netflix.find((x) => x.title === "SPY×FAMILY")?.date === "2023-10-21");
check("netflix: 第2期 split", netflix.some((x) => x.title === "呪術廻戦"));
check("netflix: movie title untouched", netflix.some((x) => x.title === "すずめの戸締まり"));
check("helpers", malDate("2024-00-00") === "2024-01-01" && looseDate("nope") === undefined &&
  showName("ダンダダン: エピソード3") === "ダンダダン");

/* ---------- preview plan ---------- */
const ledger = {
  1: { id: 1, status: "watched", rating: 4, memo: "local memo", updatedAt: 5 },
  2: { id: 2, status: "want" },
};
const plan = planImport([
  { id: 1, status: "watched", rating: 4 },     // existing, same
  { id: 2, status: "watched", rating: 3 },     // existing, differs
  { id: 3, status: "want" },                   // new
  { id: 3, status: "watched" },                // duplicate row → ignored
  null,
], ledger);
check("plan: new vs existing", plan.add.map((e) => e.id).join() === "3" && plan.existing.length === 2);
check("plan: same flag", plan.existing.find((x) => x.incoming.id === 1).same === true &&
  plan.existing.find((x) => x.incoming.id === 2).same === false);
check("plan: duplicate row — first wins", plan.add[0].status === "want");
check("plan: fields the import lacks don't count as differences",
  planImport([{ id: 1, status: "watched" }], ledger).existing[0].same === true);
const merged = mergeOverwrite(ledger[1], { id: 1, status: "dnf" });
check("overwrite keeps local-only fields", merged.status === "dnf" && merged.memo === "local memo");

console.log(`import: ${total - bad}/${total} fixture checks OK`);
if (bad) process.exit(1);
