/* ---------- kana-aware title ordering (HANDOFF §10 P3) ----------
   Sort key = Annict Work.titleKana (snapshotted onto the entry), else the
   native title when it already starts with kana. Keys are normalized to
   hiragana and bucketed into 五十音 rows for the ledger group headers. */

const ROWS = [
  ["あ", "あいうえおぁぃぅぇぉゔ"],
  ["か", "かきくけこがぎぐげごゕゖ"],
  ["さ", "さしすせそざじずぜぞ"],
  ["た", "たちつてとだぢづでどっ"],
  ["な", "なにぬねの"],
  ["は", "はひふへほばびぶべぼぱぴぷぺぽ"],
  ["ま", "まみむめも"],
  ["や", "やゆよゃゅょ"],
  ["ら", "らりるれろ"],
  ["わ", "わをんゐゑゎ"],
];
const OTHER_ROW = ROWS.length;       // 英数字・記号
const UNKNOWN_ROW = ROWS.length + 1; // kanji-leading, no reading yet

/* katakana → hiragana (ァ..ヶ are exactly 0x60 above ぁ..ゖ) */
function toHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const isKana = (c) => /[ぁ-ゖァ-ヺ]/.test(c || "");
const isKanji = (c) => /[㐀-鿿豈-﫿]/.test(c || "");

/* → { rowIdx, row, key } for one ledger entry */
function kanaSortInfo(e) {
  const native = (e.title?.native || e.title?.romaji || e.title?.english || "").trim();
  const reading = e.titleKana || (isKana(native[0]) ? native : "");
  if (reading) {
    const key = toHiragana(reading);
    const i = ROWS.findIndex(([, chars]) => chars.includes(key[0]));
    return i >= 0 ? { rowIdx: i, row: `${ROWS[i][0]}行`, key } : { rowIdx: OTHER_ROW, row: "英数字・記号", key };
  }
  if (isKanji(native[0])) return { rowIdx: UNKNOWN_ROW, row: "読み未取得", key: native };
  return { rowIdx: OTHER_ROW, row: "英数字・記号", key: native.toLowerCase() };
}

function compareKana(a, b) {
  const x = kanaSortInfo(a);
  const y = kanaSortInfo(b);
  return x.rowIdx - y.rowIdx || x.key.localeCompare(y.key, "ja");
}

export { toHiragana, kanaSortInfo, compareKana };
