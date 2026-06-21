import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown when a page failed to load data from the API. */
export default function LoadErrorState({
  message = 'Не удалось загрузить данные. Проверьте интернет и попробуйте снова.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Повторить
        </Button>
      )}
    </div>
  );
}
