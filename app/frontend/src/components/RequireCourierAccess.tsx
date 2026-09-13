import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getAccountToken } from '@/lib/accountApi';
import { logisticsApi } from '@/lib/logisticsApi';

type Props = {
  children: React.ReactNode;
};

/** Redirects to courier application hub if user is not an approved courier. */
export default function RequireCourierAccess({ children }: Props) {
  const { t: publicT } = useLanguage();
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    if (!getAccountToken()) {
      setStatus('denied');
      return;
    }
    (async () => {
      try {
        const access = await logisticsApi.getCourierAccess();
        setStatus(access.can_access_cabinet ? 'ok' : 'denied');
      } catch {
        setStatus('denied');
      }
    })();
  }, []);

  if (!getAccountToken()) return <Navigate to="/account?redirect=/delivery/courier" replace />;
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-gray-500">
        {publicT("public.RequireCabinetRole.text350")} </div>
    );
  }
  if (status === 'denied') return <Navigate to="/delivery/courier" replace />;
  return <>{children}</>;
}
