import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
  /** Skip full-height sheet panel — for compact modals (success, product) */
  bare?: boolean;
}

export default function DamAlemSheet({
  open,
  onClose,
  children,
  overlayClassName = '',
  panelClassName = '',
  bare = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={`dam-sheet-overlay ${overlayClassName}`.trim()}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {bare ? (
        <div className="dam-sheet-panel--interactive w-full max-w-md" onClick={e => e.stopPropagation()}>
          {children}
        </div>
      ) : (
        <div
          className={`dam-sheet-panel dam-sheet-panel--interactive ${panelClassName}`.trim()}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>,
    document.body,
  );
}
