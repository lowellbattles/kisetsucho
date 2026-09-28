const SEASONS = [
  { key: "WINTER", kanji: "冬", months: "1〜3月", en: "Winter", color: "#5B7A99", soft: "#EDF1F5" },
  { key: "SPRING", kanji: "春", months: "4〜6月", en: "Spring", color: "#BC5F7D", soft: "#F8EEF1" },
  { key: "SUMMER", kanji: "夏", months: "7〜9月", en: "Summer", color: "#2E7D6B", soft: "#E9F2EF" },
  { key: "FALL",   kanji: "秋", months: "10〜12月", en: "Autumn", color: "#BE5730", soft: "#F8EFE9" },
];

const SCOPE_TABS = [
  { key: "year",   kanji: "年間", months: "1年分すべて", en: "Full Year", color: "#55597A", soft: "#EDEEF4" },
  { key: "decade", kanji: "年代", months: "10年分すべて", en: "Decade", color: "#715C8C", soft: "#F0EDF5" },
];

const SORTS = [
  { key: "POPULARITY_DESC", ja: "人気順" },
  { key: "SCORE_DESC", ja: "評価順" },
  { key: "START_DATE_DESC", ja: "放送日・新しい順" },
  { key: "START_DATE", ja: "放送日・古い順" },
  { key: "TITLE_NATIVE", ja: "タイトル順" },
];

const FORMATS = [
  { key: "TV", ja: "TVアニメ" },
  { key: "MOVIE", ja: "劇場版" },
  { key: "OVA", ja: "OVA" },
  { key: "ONA", ja: "ONA" },
  { key: "SPECIAL", ja: "スペシャル" },
  { key: "TV_SHORT", ja: "TVショート" },
  { key: "MUSIC", ja: "ミュージック" },
];

const GENRES = [
  { key: "Action", ja: "アクション" },
  { key: "Adventure", ja: "アドベンチャー" },
  { key: "Comedy", ja: "コメディ" },
  { key: "Drama", ja: "ドラマ" },
  { key: "Fantasy", ja: "ファンタジー" },
  { key: "Horror", ja: "ホラー" },
  { key: "Mahou Shoujo", ja: "魔法少女" },
  { key: "Mecha", ja: "メカ" },
  { key: "Music", ja: "音楽" },
  { key: "Mystery", ja: "ミステリー" },
  { key: "Psychological", ja: "心理" },
  { key: "Romance", ja: "恋愛" },
  { key: "Sci-Fi", ja: "SF" },
  { key: "Slice of Life", ja: "日常" },
  { key: "Sports", ja: "スポーツ" },
  { key: "Supernatural", ja: "超自然" },
  { key: "Thriller", ja: "スリラー" },
  { key: "Ecchi", ja: "エッチ" },
];

const STATUSES = [
  { key: "want",     ja: "見たい",  en: "Want to Watch" },
  { key: "watching", ja: "視聴中",  en: "Watching" },
  { key: "hold",     ja: "保留",    en: "On Hold" },
  { key: "watched",  ja: "視聴済",  en: "Watched" },
  { key: "dnf",      ja: "中断",    en: "Did Not Finish" },
];

const FORMAT_JA = {
  TV: "TVアニメ", TV_SHORT: "TVショート", MOVIE: "劇場版", OVA: "OVA",
  ONA: "ONA", SPECIAL: "スペシャル", MUSIC: "ミュージック",
};

const RELATION_JA = {
  SEQUEL: "続編", PREQUEL: "前作", SIDE_STORY: "外伝", PARENT: "本編",
  SPIN_OFF: "スピンオフ", ALTERNATIVE: "別バージョン", SUMMARY: "総集編",
  SOURCE: "原作", ADAPTATION: "アニメ化", CHARACTER: "キャラクター", OTHER: "関連",
};

const ROLE_JA = { MAIN: "主演", SUPPORTING: "脇役", BACKGROUND: "その他" };

const SEASON_ORDER = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };

export {
  SEASONS, SCOPE_TABS, SORTS, FORMATS, GENRES, STATUSES,
  FORMAT_JA, RELATION_JA, ROLE_JA, SEASON_ORDER,
};
