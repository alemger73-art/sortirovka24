import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";

export default function CabinetMaster() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setData(await accountApi.masterCabinet());
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Кабинет мастера</h1>
        {error ? <p className="text-red-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title="Профиль" subtitle="Категории и фото работ">
            <p className="text-sm text-gray-600">Категории: {(data?.profile?.service_categories || []).join(", ") || "-"}</p>
            <p className="text-sm text-gray-600">Фото работ: {(data?.profile?.work_photos || []).length}</p>
          </CabinetCard>
          <CabinetCard title="Заявки">
            <p className="text-sm text-gray-600">Всего: {data?.stats?.requests_total || 0}</p>
          </CabinetCard>
          <CabinetCard title="Отзывы">
            <p className="text-sm text-gray-600">Всего: {data?.stats?.reviews_total || 0}</p>
            <p className="text-sm text-gray-600">Средняя оценка: {Number(data?.stats?.avg_rating || 0).toFixed(2)}</p>
          </CabinetCard>
          <CabinetCard title="Статистика">
            <p className="text-sm text-gray-600">Сводка по заявкам и отзывам в реальном времени.</p>
          </CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
