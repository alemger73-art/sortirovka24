interface AuthPromptModalProps {
  open: boolean;
  onClose: () => void;
  onAuth: () => void;
}

export default function AuthPromptModal({ open, onClose, onAuth }: AuthPromptModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl dark:border-white/10 dark:bg-slate-900 dark:text-white">
        <h3 className="text-xl font-bold">Требуется авторизация</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-white/70">
          Чтобы выполнить это действие, войдите в аккаунт или зарегистрируйтесь.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
          >
            Позже
          </button>
          <button
            onClick={onAuth}
            className="flex-1 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Войти / Регистрация
          </button>
        </div>
      </div>
    </div>
  );
}
