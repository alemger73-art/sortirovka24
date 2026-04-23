interface AuthPromptModalProps {
  open: boolean;
  onClose: () => void;
  onAuth: () => void;
}

export default function AuthPromptModal({ open, onClose, onAuth }: AuthPromptModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 backdrop-blur-sm" style={{ backgroundColor: 'var(--app-overlay)' }}>
      <div className="theme-transition w-full max-w-md rounded-2xl border border-app bg-app-card p-6 text-app shadow-2xl">
        <h3 className="text-xl font-bold">Требуется авторизация</h3>
        <p className="mt-2 text-sm text-app-muted">
          Чтобы выполнить это действие, войдите в аккаунт или зарегистрируйтесь.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="theme-transition flex-1 rounded-xl border border-app px-4 py-2.5 text-sm font-semibold text-app hover:bg-app-surface"
          >
            Позже
          </button>
          <button
            onClick={onAuth}
            className="theme-transition flex-1 rounded-xl bg-app-surface px-4 py-2.5 text-sm font-semibold text-app hover:opacity-90"
          >
            Войти / Регистрация
          </button>
        </div>
      </div>
    </div>
  );
}
