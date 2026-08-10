import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Portalled to document.body on purpose: `.gold-frame` sets `backdrop-filter`, which makes any
 *  ancestor a containing block for `position: fixed` and would trap this inside a panel. Rendering
 *  a fixed overlay inline in the tree is the bug HANDOFF.md §19 documents — don't reintroduce it. */
export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="gold-frame rounded-lg w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 px-4 py-2 bg-bg-panel/95 border-b border-gold-dim/30">
          <div className="font-display gold-text text-base min-w-0">{title}</div>
          <button onClick={onClose} className="text-gold-dim hover:text-gold-bright text-lg leading-none px-1 flex-shrink-0" aria-label="close">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
