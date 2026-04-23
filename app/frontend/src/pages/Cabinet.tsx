import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi, clearAccountToken } from "@/lib/accountApi";
import { Link, useNavigate } from "react-router-dom";

function RowList({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p className="text-sm text-gray-400">Пока пусто</p>;
  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((r, i) => (
        <div key={r.id || i} className="rounded-xl border border-gray-100 p-3 text-sm">
          <p className="font-medium text-gray-900">{r.title || "-"}</p>
          {r.subtitle ? <p className="text-gray-500">{r.subtitle}</p> : null}
        </div>
      ))}
    </div>
  );
}

export default function Cabinet() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const c = await accountApi.cabinet();
        setData(c);
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const role = data?.profile?.role;
  const roleLink = useMemo(() => {
    if (role === "master") return "/cabinet/master";
    if (role === "driver") return "/cabinet/driver";
    if (role === "partner") return "/cabinet/partner";
    if (role === "admin" || role === "superadmin") return "/cabinet/admin";
    return "";
  }, [role]);

  if (loading) return <Layout><div className="mx-auto max-w-6xl px-4 py-10 text-gray-500">Загрузка кабинета...</div></Layout>;

  if (error) {
    return (
      <Layout>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-red-600">{error}</p>
          <Link to="/account" className="mt-3 inline-block text-blue-600">Перейти к входу</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Личный кабинет</h1>
            <p className="text-gray-500">{data?.profile?.full_name || data?.profile?.email || data?.profile?.phone}</p>
          </div>
          <div className="flex items-center gap-2">
            {roleLink ? <Link to={roleLink} className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Кабинет роли: {role}</Link> : null}
            <button
              className="rounded-xl bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
              onClick={() => {
                clearAccountToken();
                navigate("/account");
              }}
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title="Профиль" subtitle="Данные аккаунта">
            <div className="text-sm text-gray-600">
              <p>Role: {data?.profile?.role}</p>
              <p>Email: {data?.profile?.email || "-"}</p>
              <p>Phone: {data?.profile?.phone || "-"}</p>
            </div>
          </CabinetCard>
          <CabinetCard title="История заказов"><RowList rows={data?.orders_history || []} /></CabinetCard>
          <CabinetCard title="История поездок"><RowList rows={data?.rides_history || []} /></CabinetCard>
          <CabinetCard title="Объявления"><RowList rows={data?.announcements || []} /></CabinetCard>
          <CabinetCard title="Жалобы"><RowList rows={data?.complaints || []} /></CabinetCard>
          <CabinetCard title="Избранное"><RowList rows={data?.favorites || []} /></CabinetCard>
          <CabinetCard title="Бонусы"><RowList rows={data?.bonuses || []} /></CabinetCard>
          <CabinetCard title="Уведомления"><RowList rows={data?.notifications || []} /></CabinetCard>
          <CabinetCard title="Платежи"><RowList rows={data?.payment_history || []} /></CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
