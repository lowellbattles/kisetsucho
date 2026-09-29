/* build_standalone.mjs — build the standalone single-file version of 季節帳.
   Successor to build_html.py (retired with the modular refactor, HANDOFF §8/§13-9):
   runs the real Vite production build, then inlines the JS bundle and CSS into
   one self-contained dist-standalone/kisetsucho.html. No CDN scripts, no
   in-browser babel — the artifact is the actual production app in a single file.

   The artifact is deliberately KEYLESS (HANDOFF §10/§12): VITE_TMDB_KEY is
   forced empty for this build regardless of .env.local, because the output is
   a committable file and must never embed the personal key. TMDB features
   activate via the ⚙ settings panel instead.

   Usage: npm run build:standalone */
import { build } from "vite";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = join(root, "dist-standalone", ".tmp-build");
const out = join(root, "dist-standalone", "kisetsucho.html");

process.env.VITE_TMDB_KEY = ""; // outranks .env.local (Vite env priority) → keyless artifact

await build({
  root,
  logLevel: "warn",
  build: { outDir: tmp, emptyOutDir: true },
});

let html = readFileSync(join(tmp, "index.html"), "utf8");

// Inline the single JS chunk (escape "</script>" inside the bundle, if any).
html = html.replace(
  /<script type="module"[^>]*src="(?:\.?\/)?(assets\/[^"]+\.js)"[^>]*><\/script>/,
  (_, p) => `<script type="module">\n${readFileSync(join(tmp, p), "utf8").replace(/<\/script>/g, "<\\/script>")}\n</script>`
);

// Inline the CSS asset.
html = html.replace(
  /<link rel="stylesheet"[^>]*href="(?:\.?\/)?(assets\/[^"]+\.css)"[^>]*>/,
  (_, p) => `<style>\n${readFileSync(join(tmp, p), "utf8")}\n</style>`
);

// Drop the external favicon reference — keep the file fully self-contained.
html = html.replace(/\s*<link rel="icon"[^>]*>/, "");

if (/src="(?:\.?\/)?assets\//.test(html) || /href="(?:\.?\/)?assets\//.test(html)) {
  throw new Error("un-inlined asset reference remains — inspect " + tmp);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");
rmSync(tmp, { recursive: true, force: true });
console.log(`OK: wrote dist-standalone/kisetsucho.html (${html.length.toLocaleString()} chars)`);
