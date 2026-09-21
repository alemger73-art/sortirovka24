import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { accountApi, setAccountToken } from "@/lib/accountApi";
import { linkPushTokenToAccount, syncWebPushSubscriptionToAccount } from "@/lib/pushNotifications";
import { cacheAccountProfile } from "@/lib/localAuth";

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

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const redirectParam = params.get("redirect");
      const redirectTo =
        redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
          ? redirectParam
          : null;
      const error = params.get("error");
      if (error) {
        setMessage(error);
        return;
      }

      const token = hash.get("token");
      const role = hash.get("role") || "user";
      if (!token) {
        setMessage(publicT("public.GoogleAccountCallback.text188"));
        return;
      }

      try {
        setAccountToken(token);
        void linkPushTokenToAccount();
        void syncWebPushSubscriptionToAccount();
        const me = await accountApi.me();
        if (cancelled) return;
        cacheAccountProfile({
          id: me.id,
          name: me.name,
          phone: me.phone,
          email: me.email,
          avatar: me.avatar,
        });
        navigate(redirectTo || getCabinetRouteByRole(role), { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        setMessage(String(e?.message || publicT("public.GoogleAccountCallback.text189")));
      }
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <Layout>
      <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-gray-700 dark:text-gray-200">{message}</p>
        </div>
      </div>
    </Layout>
  );
}
