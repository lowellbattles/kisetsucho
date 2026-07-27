#!/usr/bin/env python3
"""
build_html.py — build the standalone single-file version of 季節帳.

Converts the Vite React source (src/App.jsx) into dist-standalone/kisetsucho.html:
a zero-setup file that runs by double-clicking (React + ReactDOM + babel-standalone
from cdnjs, in-browser JSX transform, localStorage-backed storage shim inlined).

Assumptions (matching HANDOFF.md §8):
  - src/App.jsx is self-contained apart from React imports
    (top-level `import ... from "react"` lines and one `export default function App`).
  - If App.jsx has been split into modules, this script is no longer sufficient —
    either bundle via `vite build` + a single-file plugin, or retire this script
    explicitly per HANDOFF §13 invariant 9.

Usage:  python3 scripts/build_html.py [src] [out]
        defaults: src/App.jsx → dist-standalone/kisetsucho.html
"""

import re
import sys
from pathlib import Path

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src/App.jsx")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("dist-standalone/kisetsucho.html")

REACT_HOOKS = "useState, useEffect, useMemo, useCallback, useRef"

STORAGE_SHIM = """
/* ---------- storage shim (localStorage-backed, same API as Claude artifacts) ---------- */
window.storage = window.storage || {
  async get(key) {
    const v = localStorage.getItem("kisetsucho::" + key);
    if (v === null) throw new Error("key not found");
    return { key, value: v, shared: false };
  },
  async set(key, value) {
    localStorage.setItem("kisetsucho::" + key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    localStorage.removeItem("kisetsucho::" + key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith("kisetsucho::" + prefix)) keys.push(k.slice("kisetsucho::".length));
    }
    return { keys, prefix, shared: false };
  },
};
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>季節帳 — Seasonal Anime Ledger</title>
<style>html, body {{ margin: 0; padding: 0; }}</style>
<script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script crossorigin src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
{shim}
{src}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>
"""


def transform(source: str) -> str:
    """Strip ES-module syntax so the code runs under babel-standalone globals."""
    # Remove any top-level import lines (React etc.).
    source = re.sub(r"^import\s[^\n]*\n", "", source, flags=re.MULTILINE)
    # Replace the default export with a plain declaration.
    source, n = re.subn(r"export\s+default\s+function\s+App\(", "function App(", source)
    if n != 1:
        raise SystemExit(
            "ERROR: expected exactly one `export default function App(` in "
            f"{SRC} (found {n}). Has the app been split into modules? "
            "See the docstring / HANDOFF.md §8."
        )
    # Any other export statements would silently break — fail loudly instead.
    if re.search(r"^export\s", source, flags=re.MULTILINE):
        raise SystemExit("ERROR: additional `export` statements found; this script only supports the single-file App.jsx layout.")
    # Provide React hooks as globals.
    return f"const {{ {REACT_HOOKS} }} = React;\n" + source


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"ERROR: source not found: {SRC}")
    src = transform(SRC.read_text(encoding="utf-8"))
    html = HTML_TEMPLATE.format(shim=STORAGE_SHIM, src=src)

    # Sanity checks before writing.
    assert "import " not in src.split("\n", 1)[0], "import residue in first line"
    assert "export default" not in src, "export residue"
    assert html.count("<script") == html.count("</script>"), "unbalanced script tags"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"OK: wrote {OUT} ({len(html):,} chars)")


if __name__ == "__main__":
    main()
