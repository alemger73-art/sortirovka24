import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn } from '@/lib/localAuth';

export default function RequireUserAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn()) return;
    const goToLogin = window.confirm('Войдите или зарегистрируйтесь, чтобы выполнить это действие.');
    navigate(goToLogin ? '/login' : '/', { replace: true });
  }, [navigate]);

  if (!isLoggedIn()) return null;
  return <>{children}</>;
}
