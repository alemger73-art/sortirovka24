import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";

export default function CabinetPartner() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setData(await accountApi.partnerCabinet());
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Кабинет партнера</h1>
        {error ? <p className="text-red-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title="Профиль магазина">
            <p className="text-sm text-gray-600">Название: {data?.shop_profile?.shop_name || "-"}</p>
            <p className="text-sm text-gray-600">Баннеров: {(data?.shop_profile?.banners || []).length}</p>
          </CabinetCard>
          <CabinetCard title="Товары">
            <p className="text-sm text-gray-600">Всего: {(data?.products || []).length}</p>
          </CabinetCard>
          <CabinetCard title="Заказы">
            <p className="text-sm text-gray-600">Всего: {(data?.orders || []).length}</p>
          </CabinetCard>
          <CabinetCard title="Аналитика">
            <p className="text-sm text-gray-600">Выручка: {Number(data?.analytics?.revenue || 0).toFixed(0)} KZT</p>
          </CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
