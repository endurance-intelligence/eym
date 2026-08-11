import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalScrollLock } from "../services/modalScrollLock";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function EditorModal({
  eyebrow,
  title,
  description = "",
  onClose,
  children,
  className = "",
  width = "wide",
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useModalScrollLock(true);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const preferredFocus = dialog?.querySelector(".editor-modal-body input:not([type='hidden']):not([disabled]), .editor-modal-body select:not([disabled]), .editor-modal-body textarea:not([disabled])");
    const fallbackFocus = dialog?.querySelector(FOCUSABLE_SELECTOR);
    window.requestAnimationFrame(() => (preferredFocus || fallbackFocus)?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const close = () => onCloseRef.current?.();
  const modal = (
    <div className="modal-backdrop editor-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section
        ref={dialogRef}
        className={`modal editor-modal editor-modal-${width} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <button type="button" className="close" onClick={close} aria-label="Schließen">×</button>
        <header className="editor-modal-heading">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId} className="muted">{description}</p>}
        </header>
        <div className="editor-modal-body">{children}</div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
