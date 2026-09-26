import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAccountToken } from '@/lib/accountApi';
import AuthGateLoader from '@/components/AuthGateLoader';

export default function RequireUserAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const authed = Boolean(getAccountToken());

  useEffect(() => {
    if (!authed) navigate(`/account?redirect=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  }, [authed, navigate, location.pathname, location.search]);

  if (!authed) return <AuthGateLoader />;
  return <>{children}</>;
}
