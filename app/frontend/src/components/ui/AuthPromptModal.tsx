interface AuthPromptModalProps {
  open: boolean;
  onClose: () => void;
  onAuth: () => void;
}

export default function AuthPromptModal({ open, onClose, onAuth }: AuthPromptModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 text-white shadow-2xl">
        <h3 className="text-xl font-bold">Требуется авторизация</h3>
        <p className="mt-2 text-sm text-white/70">
          Чтобы выполнить это действие, войдите в аккаунт или зарегистрируйтесь.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Позже
          </button>
          <button
            onClick={onAuth}
            className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
          >
            Войти / Регистрация
          </button>
        </div>
      </div>
    </div>
  );
}
