import React, { useEffect, useRef } from 'react';

// Wraps a modal's content to give it dialog semantics and keyboard behaviour:
//   • role="dialog" + aria-modal, labelled by `label`
//   • Esc closes (only the top-most open dialog reacts)
//   • Tab / Shift+Tab stay inside the dialog
//   • focus moves in on open and returns to the previous element on close
// Renders with display:contents so it never affects the modal's layout.
const stack = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ModalA11y({ onClose, label, children }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const token = {};
    stack.push(token);
    const prevFocus = document.activeElement;
    const focusables = () => [...(ref.current?.querySelectorAll(FOCUSABLE) || [])].filter(el => el.offsetParent !== null || el === document.activeElement);

    // Focus the preferred element (data-autofocus), an existing autofocus, or the first control.
    const t = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return;
      const pref = ref.current?.querySelector('[data-autofocus]') || focusables()[0];
      pref?.focus?.();
    }, 0);

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape' && onCloseRef.current) {
        e.preventDefault(); e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        const inside = ref.current?.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(token); if (i >= 0) stack.splice(i, 1);
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
    };
  }, []);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
