import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccountToken } from '@/lib/accountApi';

export default function RequireUserAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (getAccountToken()) return;
    navigate('/account', { replace: true });
  }, [navigate]);

  if (!getAccountToken()) return null;
  return <>{children}</>;
}
