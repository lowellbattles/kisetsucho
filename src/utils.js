import { SEASONS } from "./constants.js";

/* ---------- misc helpers ---------- */

function stripHtml(s) {
  if (!s) return "";
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function currentSeason() {
  const m = new Date().getMonth() + 1;
  if (m <= 3) return "WINTER";
  if (m <= 6) return "SPRING";
  if (m <= 9) return "SUMMER";
  return "FALL";
}

function seasonJa(seasonKey, year) {
  const s = SEASONS.find((x) => x.key === seasonKey);
  return s && year ? `${year}年${s.kanji}` : year ? `${year}年` : "";
}

function fmtFuzzyDate(d) {
  if (!d || !d.year) return "";
  let s = `${d.year}年`;
  if (d.month) s += `${d.month}月`;
  if (d.day) s += `${d.day}日`;
  return s;
}

function airDateLine(media) {
  const date = fmtFuzzyDate(media.startDate);
  if (!date) return "";
  const label =
    media.format === "MOVIE" ? "公開" :
    media.format === "OVA" || media.format === "SPECIAL" || media.format === "MUSIC" ? "発売・公開" :
    "放送開始";
  return `${label}：${date}`;
}

function officialLink(media) {
  const links = media.externalLinks || [];
  return (
    links.find((l) => /official/i.test(l.site || "") && (l.language === "Japanese" || !l.language)) ||
    links.find((l) => /official/i.test(l.site || "")) ||
    null
  );
}

function anilistStreamingLinks(media) {
  return (media.externalLinks || [])
    .filter((l) => l.type === "STREAMING")
    .sort((a, b) => ((b.language === "Japanese") ? 1 : 0) - ((a.language === "Japanese") ? 1 : 0));
}

function infoLinks(media) {
  return (media.externalLinks || []).filter(
    (l) => l.type !== "STREAMING" && !/official/i.test(l.site || "")
  ).slice(0, 6);
}

export {
  stripHtml, today, currentSeason, seasonJa, fmtFuzzyDate,
  airDateLine, officialLink, anilistStreamingLinks, infoLinks,
};
