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
  /** For e2e tests */
  testId?: string;
}

export default function DamAlemSheet({
  open,
  onClose,
  children,
  overlayClassName = '',
  panelClassName = '',
  bare = false,
  testId,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('dam-sheet-open');
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove('dam-sheet-open');
    };
  }, [open]);

  if (!open) return null;

  const panelClass = bare
    ? `dam-sheet-panel--interactive dam-sheet-bare ${panelClassName}`.trim()
    : `dam-sheet-panel dam-sheet-panel--interactive ${panelClassName}`.trim();

  return createPortal(
    <div
      className={`dam-sheet-overlay ${overlayClassName}`.trim()}
      role="dialog"
      aria-modal="true"
      data-testid={testId ? `${testId}-overlay` : undefined}
    >
      <button
        type="button"
        className="dam-sheet-backdrop"
        onClick={onClose}
        aria-label="Закрыть"
        tabIndex={-1}
      />
      <div className={panelClass} data-testid={testId}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
