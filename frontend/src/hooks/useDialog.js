import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard and focus behaviour expected of a modal dialog: Escape closes it,
 * Tab stays inside it, and focus returns to whatever opened it.
 */
export function useDialog(onClose) {
  const ref = useRef(null);
  const previouslyFocused = useRef(null);

  /**
   * Held in a ref so the effect below can run exactly once.
   *
   * Callers pass an inline arrow, so onClose changes identity on every parent
   * render — and the parent here re-renders whenever fleet data arrives. As a
   * dependency it re-ran this effect constantly, and each run moved focus to
   * the first focusable element, yanking the caret out of whatever field was
   * being typed into and onto the close button.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previouslyFocused.current = document.activeElement;

    const container = ref.current;
    container?.querySelector(FOCUSABLE)?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;

      // Filtering on offsetParent would be a visibility check, but it needs
      // layout — which makes the trap untestable and buys little here, since
      // conditional fields are removed from the DOM rather than hidden.
      const focusable = [...container.querySelectorAll(FOCUSABLE)].filter(
        (el) => !el.disabled && el.getAttribute("aria-hidden") !== "true"
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
    // Deliberately empty: this must set up once per open, not per render.
  }, []);

  return ref;
}

export default useDialog;
