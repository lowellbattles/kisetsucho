import { useEffect, useRef } from "react";

/* ---------- shared modal shell (a11y pass, HANDOFF §10 P3) ----------
   Overlay + dialog with: focus moved into the dialog on open, Tab / Shift+Tab
   trapped inside, Escape closes (topmost modal only — the seiyuu modal
   stacks above the detail modal), focus returned to the opener on close.
   `closable={false}` disables Escape and backdrop clicks (sync in progress). */

const stack = []; // open modals, topmost last

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Modal({ onClose, closable = true, labelledBy, className = "", overlayClassName = "", children }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  const closableRef = useRef(closable);
  onCloseRef.current = onClose;
  closableRef.current = closable;

  useEffect(() => {
    const token = {};
    stack.push(token);
    const opener = document.activeElement;
    ref.current?.focus();

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        if (closableRef.current) { e.preventDefault(); onCloseRef.current(); }
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = ref.current.contains(active);
      if (e.shiftKey && (active === first || active === ref.current || !inside)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div className={`overlay${overlayClassName ? ` ${overlayClassName}` : ""}`}
      onClick={closable ? onClose : undefined}>
      <div
        ref={ref}
        className={`modal${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
