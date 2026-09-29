import { useState } from "react";

/* Collapsible counted list used by the preview screens (Annict sync,
   他サービスから取り込む): header "label hint … n件 ▸", disabled when empty. */
function ListSection({ label, hint, count, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="sync-block">
      <button className="sync-head" onClick={() => setOpen(!open)} disabled={count === 0}
        aria-expanded={count > 0 ? open : undefined}>
        <span>{label} <span className="en-hint">{hint}</span></span>
        <span className="sync-count">
          <b>{count}</b>件{count > 0 && <span className="sync-caret">{open ? "▾" : "▸"}</span>}
        </span>
      </button>
      {open && count > 0 && <ul className="sync-list">{children}</ul>}
    </div>
  );
}

export default ListSection;
