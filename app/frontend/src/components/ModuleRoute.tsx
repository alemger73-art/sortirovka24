import { Navigate, useLocation } from 'react-router-dom';
import { useModules } from '@/hooks/useModules';
import { moduleForPath, type ModuleKey } from '@/config/modules';

/**
 * Guards a route that belongs to a toggleable module. When the module is
 * disabled in admin, the route redirects home so a direct link cannot reach it.
 *
 * Pass `module` explicitly, or let it be inferred from the current path.
 */
export default function ModuleRoute({
  module,
  children,
}: {
  module?: ModuleKey;
  children: JSX.Element;
}) {
  const { pathname } = useLocation();
  const { isEnabled, loading } = useModules();
  const key = module ?? moduleForPath(pathname);

  // While settings load, render the page (avoids a flash-redirect on refresh).
  if (loading) return children;
  if (key && !isEnabled(key)) return <Navigate to="/" replace />;
  return children;
}
