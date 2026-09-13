import { useStoreTranslations } from '@/i18n/storeTranslations';
import { useEffect, useRef, type ReactNode } from 'react';
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
  const st = useStoreTranslations();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('dam-sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
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
        aria-label={st("Закрыть")}
        tabIndex={-1}
      />
      <div ref={panelRef} tabIndex={-1} className={panelClass} data-testid={testId}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
