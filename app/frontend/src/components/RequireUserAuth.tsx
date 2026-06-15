import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccountToken } from '@/lib/accountApi';
import AuthGateLoader from '@/components/AuthGateLoader';

export default function RequireUserAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const authed = Boolean(getAccountToken());

  useEffect(() => {
    if (!authed) navigate('/account', { replace: true });
  }, [authed, navigate]);

  if (!authed) return <AuthGateLoader />;
  return <>{children}</>;
}
