import { useEffect, useRef, type KeyboardEvent } from 'react';

// Native modal inertness plus an explicit boundary keeps Tab out of browser chrome.
export function trapDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button,input,textarea,select,a[href],[tabindex]',
    ),
  ].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      el.getClientRects().length &&
      !(
        el instanceof HTMLInputElement &&
        el.type === 'radio' &&
        !el.checked &&
        [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some(
          (radio) => radio.name === el.name && radio.checked,
        )
      ),
  );
  const first = controls[0],
    last = controls.at(-1);
  if (!first) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function useModalFocus() {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture before React's autofocus commit moves focus into the dialog.
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        // StrictMode immediately reopens a mounted dialog after effect cleanup.
        if (!dialog?.open && opener.current?.isConnected) opener.current.focus();
      });
    };
  }, []);
  return { ref, onKeyDown: trapDialogTab };
}
