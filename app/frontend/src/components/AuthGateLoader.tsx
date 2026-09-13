import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

/** Shown while auth redirect is in progress — avoids white flash. */
export default function AuthGateLoader() {
  const { t: publicT } = useLanguage();
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-slate-400">
      <Loader2 className="h-7 w-7 animate-spin text-blue-600 dark:text-blue-400" />
      <p className="text-sm">{publicT("public.Salons.text216")}</p>
    </div>
  );
}
