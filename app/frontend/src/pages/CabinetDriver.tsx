import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";

export default function CabinetDriver() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setData(await accountApi.driverCabinet());
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Кабинет водителя</h1>
        {error ? <p className="text-red-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title="Статус и авто">
            <p className="text-sm text-gray-600">Онлайн: {data?.profile?.online ? "Да" : "Нет"}</p>
            <p className="text-sm text-gray-600">Авто: {data?.profile?.car_info?.make || "-"} {data?.profile?.car_info?.model || ""}</p>
          </CabinetCard>
          <CabinetCard title="Доступные заказы">
            <p className="text-sm text-gray-600">Сейчас доступно: {(data?.available_orders || []).length}</p>
          </CabinetCard>
          <CabinetCard title="История заказов">
            <p className="text-sm text-gray-600">Всего поездок: {(data?.order_history || []).length}</p>
          </CabinetCard>
          <CabinetCard title="Заработок">
            <p className="text-xl font-semibold text-gray-900">{Number(data?.earnings || 0).toFixed(0)} KZT</p>
          </CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
