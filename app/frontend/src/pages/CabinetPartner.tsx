import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CabinetPartner() {
  const { t } = useLanguage();
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("cabinet.partnerTitle")}</h1>
          <div className="flex gap-3">
            <Link to="/gastronom" className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">{t("store.gastronom")} →</Link>
            <Link to="/cabinet" className="text-sm font-semibold text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:hover:text-white">← {t("cabinet.personalTitle")}</Link>
          </div>
        </div>
        {error ? <p className="text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title={t("cabinetPartner.shopProfile")}>
            <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.shopName")}: {data?.shop_profile?.shop_name || "-"}</p>
            <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.phone")}: {data?.shop_profile?.phone || "-"}</p>
            <p className="text-sm text-gray-600 dark:text-slate-300 line-clamp-3">{data?.shop_profile?.shop_description || ""}</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.restaurants")}: {data?.analytics?.restaurants_total || 0}</p>
          </CabinetCard>
          <CabinetCard title={t("cabinetPartner.products")}>
            <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.activeCount")}: {data?.analytics?.products_total || 0}</p>
            <div className="mt-2 space-y-1">
              {(data?.products || []).slice(0, 5).map((p: any) => (
                <p key={p.id} className="text-sm text-gray-600 dark:text-slate-300">{p.title} — {Number(p.price || 0).toLocaleString("ru-RU")} ₸</p>
              ))}
            </div>
          </CabinetCard>
          <CabinetCard title={t("cabinetPartner.foodOrders")}>
            <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.total")}: {(data?.orders || []).length}</p>
            <div className="mt-2 space-y-2">
              {(data?.orders || []).slice(0, 5).map((o: any) => (
                <div key={o.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-900 dark:border-gray-800 dark:text-white">
                  <p className="font-medium">#{o.id} · {o.status}</p>
                  <p className="text-gray-500 dark:text-slate-400">{Number(o.total || 0).toLocaleString("ru-RU")} ₸</p>
                </div>
              ))}
            </div>
          </CabinetCard>
          <CabinetCard title={t("cabinetPartner.analytics")}>
            <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.revenue")}: {Number(data?.analytics?.revenue || 0).toLocaleString("ru-RU")} ₸</p>
            <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinetPartner.gastronomOrders")}: {data?.analytics?.gastronom_orders_total || 0}</p>
          </CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
