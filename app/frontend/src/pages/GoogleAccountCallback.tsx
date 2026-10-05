import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { accountApi, setAccountToken } from "@/lib/accountApi";
import { linkPushTokenToAccount, syncWebPushSubscriptionToAccount } from "@/lib/pushNotifications";
import { cacheAccountProfile } from "@/lib/localAuth";
import { safeInternalPath } from '@/lib/pwa';
import { Link } from 'react-router-dom';

function getCabinetRouteByRole(role?: string): string {
  switch (role) {
    case "admin":
    case "superadmin":
    case "moderator":
      return "/cabinet/admin";
    case "master":
      return "/cabinet/master";
    case "driver":
      return "/cabinet";
    case "seller":
      return "/cabinet/partner";
    default:
      return "/cabinet";
  }
}

export default function GoogleAccountCallback() {
  const { t: publicT } = useLanguage();
  const navigate = useNavigate();
  const [message, setMessage] = useState(publicT("public.GoogleAccountCallback.text187"));
  const [failed, setFailed] = useState(false);
  const [callback] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return {
      error: params.get('error'),
      token: hash.get('token'),
      role: hash.get('role') || 'user',
      redirect: sessionStorage.getItem('s24-auth-return'),
    };
  });

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const redirectParam = callback.redirect;
      sessionStorage.removeItem('s24-auth-return');
      const redirectTo = redirectParam ? safeInternalPath(redirectParam, '/cabinet') : null;
      const error = callback.error;
      if (error) {
        setFailed(true);
        setMessage(error);
        return;
      }

      const token = callback.token;
      const role = callback.role;
      if (!token) {
        setFailed(true);
        setMessage(publicT("public.GoogleAccountCallback.text188"));
        return;
      }

      try {
        setAccountToken(token);
        window.history.replaceState(null, '', window.location.pathname);
        void linkPushTokenToAccount();
        void syncWebPushSubscriptionToAccount();
        const me = await accountApi.me().catch(() => null);
        if (cancelled) return;
        if (me) cacheAccountProfile({
          id: me.id,
          name: me.name,
          phone: me.phone,
          email: me.email,
          avatar: me.avatar,
        });
        navigate(redirectTo || getCabinetRouteByRole(role), { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        setFailed(true);
        setMessage(String(e?.message || publicT("public.GoogleAccountCallback.text189")));
      }
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate, callback]);

  return (
    <Layout>
      <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {!failed && <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />}
          <p className="text-sm text-gray-700 dark:text-gray-200">{message}</p>
          {failed && <Link to="/login" className="mt-4 block text-blue-600">{publicT('auth.login')}</Link>}
        </div>
      </div>
    </Layout>
  );
}
