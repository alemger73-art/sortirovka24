import { Navigate, useLocation } from 'react-router-dom';
import { useModules } from '@/hooks/useModules';
import { moduleForPath, type ModuleKey } from '@/config/modules';
import { Loader2 } from 'lucide-react';

/**
 * Guards a route that belongs to a toggleable module. When the module is
 * disabled in admin, the route redirects home so a direct link cannot reach it.
 *
 * Pass `module` explicitly, or let it be inferred from the current path.
 */
export default function ModuleRoute({
  module,
  anyOf,
  children,
}: {
  module?: ModuleKey;
  anyOf?: ModuleKey[];
  children: JSX.Element;
}) {
  const { pathname } = useLocation();
  const { isEnabled, loading, error, retry } = useModules();
  const key = module ?? moduleForPath(pathname);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (error) return <div role="alert" className="mx-auto max-w-md p-6"><p>Не удалось проверить доступность раздела. Проверьте соединение.</p><button className="mt-4 min-h-12 rounded-xl border px-4" onClick={retry}>Повторить загрузку</button></div>;
  if ((anyOf && !anyOf.some(isEnabled)) || (key && !isEnabled(key))) return <Navigate to="/" replace />;
  return children;
}
