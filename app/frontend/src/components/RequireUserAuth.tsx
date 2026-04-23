import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn, openAuthPrompt } from '@/lib/localAuth';

export default function RequireUserAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn()) return;
    openAuthPrompt('/login');
    navigate('/', { replace: true });
  }, [navigate]);

  if (!isLoggedIn()) return null;
  return <>{children}</>;
}
