import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { accountApi, setAccountToken } from "@/lib/accountApi";
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
      return "/cabinet/driver";
    case "seller":
      return "/cabinet/partner";
    default:
      return "/cabinet";
  }
}

export default function GoogleAccountCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Завершаем вход через Google...");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const error = params.get("error");
      if (error) {
        setMessage(error);
        return;
      }

      const token = hash.get("token");
      const role = hash.get("role") || "user";
      if (!token) {
        setMessage("Не удалось получить токен Google. Попробуйте войти снова.");
        return;
      }

      try {
        setAccountToken(token);
        const me = await accountApi.me();
        if (cancelled) return;
        cacheAccountProfile({
          id: me.id,
          name: me.name,
          phone: me.phone,
          email: me.email,
          avatar: me.avatar,
        });
        navigate(getCabinetRouteByRole(role), { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        setMessage(String(e?.message || "Ошибка входа через Google"));
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
