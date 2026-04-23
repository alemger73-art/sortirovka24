import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { Link, useNavigate } from "react-router-dom";
import { getCabinetData, getCurrentUser, logoutLocalUser, onAuthChanged } from "@/lib/localAuth";

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
  const [user, setUser] = useState(getCurrentUser());

  useEffect(() => {
    return onAuthChanged(() => setUser(getCurrentUser()));
  }, []);

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-gray-700">Вы не вошли в аккаунт.</p>
          <Link to="/login" className="mt-3 inline-block text-blue-600">Войти или зарегистрироваться</Link>
        </div>
      </Layout>
    );
  }

  const data = getCabinetData(user.id);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Личный кабинет</h1>
            <p className="text-gray-500">{user.name}</p>
            <p className="text-sm text-gray-500">{user.phone}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
              onClick={() => {
                logoutLocalUser();
                navigate("/login");
              }}
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title="Профиль" subtitle="Данные пользователя">
            <div className="text-sm text-gray-600">
              <p>Имя: {user.name}</p>
              <p>Телефон: {user.phone}</p>
              <p>Email: {user.email || "-"}</p>
            </div>
          </CabinetCard>
          <CabinetCard title="Мои заказы (еда)"><RowList rows={data.foodOrders || []} /></CabinetCard>
          <CabinetCard title="Мои объявления"><RowList rows={data.announcements || []} /></CabinetCard>
          <CabinetCard title="Мои заявки (нужен мастер)"><RowList rows={data.masterRequests || []} /></CabinetCard>
          <CabinetCard title="Мои жалобы"><RowList rows={data.complaints || []} /></CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
