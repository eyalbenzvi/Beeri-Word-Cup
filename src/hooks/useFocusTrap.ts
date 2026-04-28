import { useEffect } from "react";

// Selector for elements that can receive keyboard focus.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * useFocusTrap — keeps Tab/Shift+Tab inside `ref.current` while `active`.
 * Also moves initial focus to the first focusable element and restores
 * focus to the previously-focused element on close.
 */
export function useFocusTrap(ref: { current: HTMLElement | null }, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("inert") && el.offsetParent !== null,
      );

    // Move focus into the dialog. Prefer the first focusable, fall back to the
    // container itself so the browser doesn't leave focus outside.
    const firstFocusable = getFocusable()[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !node.contains(current))) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && (current === last || !node.contains(current))) {
        first.focus();
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // iOS Safari moves focus to the body when a dialog closes via tap-
      // outside; calling .focus() on a stale element re-opens the keyboard
      // and can cause an unwanted scroll-jump. Only restore when the
      // document still has focus (i.e. the user is interacting), and the
      // element is actually focusable + still in the DOM.
      try {
        if (
          document.hasFocus() &&
          previouslyFocused &&
          typeof previouslyFocused.focus === "function" &&
          previouslyFocused.isConnected
        ) {
          previouslyFocused.focus({ preventScroll: true });
        }
      } catch {
        /* noop — best effort */
      }
    };
  }, [ref, active]);
}
