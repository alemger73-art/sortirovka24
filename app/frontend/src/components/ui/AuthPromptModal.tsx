import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
interface AuthPromptModalProps {
  open: boolean;
  onClose: () => void;
  onAuth: () => void;
}

export default function AuthPromptModal({ open, onClose, onAuth }: AuthPromptModalProps) {
  const { t: publicT } = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previousFocus?.focus();
  }, [open]);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="auth-prompt-modal"
        className="w-full max-w-md max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-white"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); onClose(); }
          if (event.key !== 'Tab') return;
          const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button');
          const first = buttons?.[0], last = buttons?.[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
      >
        <h3 id={titleId} className="text-xl font-bold">{publicT("public.AuthPromptModal.text359")}</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-white/70">
          {publicT("public.AuthPromptModal.text360")} </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
          >
            {publicT("public.AuthPromptModal.text361")} </button>
          <button
            type="button"
            data-testid="auth-prompt-modal-login"
            onClick={onAuth}
            className="min-h-11 flex-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {publicT("public.AuthPromptModal.text362")} </button>
        </div>
      </div>
    </div>, document.body,
  );
}
