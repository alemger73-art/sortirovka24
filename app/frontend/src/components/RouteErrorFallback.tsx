import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  error?: Error | null;
  onRetry?: () => void;
};

export default function RouteErrorFallback({ error, onRetry }: Props) {
  const retry = onRetry ?? (() => window.location.reload());

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0B0F19] via-[#111827] to-[#1a2744] flex flex-col items-center justify-center px-6 text-center text-white">
      <img
        src="/icon-192.png"
        alt=""
        width={72}
        height={72}
        className="mb-5 rounded-2xl shadow-lg shadow-blue-500/30"
      />
      <h1 className="text-xl font-bold">Что-то пошло не так</h1>
      <p className="mt-2 max-w-sm text-sm text-white/70">
        Страница не загрузилась. Проверьте интернет и попробуйте снова.
      </p>
      {error?.message && (
        <p className="mt-3 max-w-sm truncate text-xs text-white/40">{error.message}</p>
      )}
      <Button
        className="mt-6 rounded-xl bg-yellow-400 px-6 font-semibold text-gray-900 hover:bg-yellow-500"
        onClick={retry}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Обновить
      </Button>
    </div>
  );
}
