import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { accountApi, getAccountToken } from "@/lib/accountApi";

type Props = {
  allowedRoles: string[];
  children: React.ReactNode;
};

/** Redirects to /cabinet if the logged-in user lacks a role-specific cabinet role. */
export default function RequireCabinetRole({ allowedRoles, children }: Props) {
  const { t: publicT } = useLanguage();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    if (!getAccountToken()) {
      navigate("/account", { replace: true });
      return;
    }
    (async () => {
      try {
        const me = await accountApi.me();
        const elevated = new Set(["admin", "superadmin", "moderator"]);
        if (elevated.has(me.role) || allowedRoles.includes(me.role)) {
          setStatus("ok");
        } else {
          setStatus("denied");
        }
      } catch {
        navigate("/account", { replace: true });
      }
    })();
  }, [allowedRoles, navigate]);

  if (!getAccountToken()) return <Navigate to="/account" replace />;
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-gray-500 dark:text-slate-300">
        {publicT("public.RequireCabinetRole.text350")} </div>
    );
  }
  if (status === "denied") return <Navigate to="/cabinet" replace />;
  return <>{children}</>;
}
