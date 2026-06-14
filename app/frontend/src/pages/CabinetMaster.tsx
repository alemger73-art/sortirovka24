import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import { accountApi } from "@/lib/accountApi";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CabinetMaster() {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ description: "", services: "", whatsapp: "", telegram: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await accountApi.masterCabinet();
        setData(res);
        setForm({
          description: res?.profile?.bio || "",
          services: (res?.profile?.service_categories || []).join(", "),
          whatsapp: "",
          telegram: "",
        });
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await accountApi.updateMasterProfile({
        description: form.description,
        services: form.services,
        whatsapp: form.whatsapp || undefined,
        telegram: form.telegram || undefined,
      });
      setSuccess("Профиль мастера обновлён");
      setData(await accountApi.masterCabinet());
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("cabinet.masterTitle")}</h1>
          <Link to="/cabinet" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← {t("cabinet.personalTitle")}</Link>
        </div>
        {error ? <p className="mb-3 text-red-600">{error}</p> : null}
        {success ? <p className="mb-3 text-green-600">{success}</p> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CabinetCard title="Профиль" subtitle="Описание и услуги">
            {!data?.profile?.listing_id ? (
              <p className="text-sm text-gray-600">Карточка мастера не найдена. Подайте заявку в разделе «Мастера».</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Категория: {(data?.profile?.service_categories || []).join(", ") || "-"}</p>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  rows={4}
                  placeholder="Описание услуг"
                />
                <input
                  value={form.services}
                  onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  placeholder="Услуги (через запятую)"
                />
                <button onClick={saveProfile} disabled={saving} className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-60">
                  {saving ? t("cabinet.saving") : t("common.save")}
                </button>
              </div>
            )}
            <p className="mt-3 text-sm text-gray-600">Фото работ: {(data?.profile?.work_photos || []).length}</p>
          </CabinetCard>
          <CabinetCard title="Заявки">
            <p className="text-sm text-gray-600">Всего: {data?.stats?.requests_total || 0}</p>
            <div className="mt-2 space-y-2">
              {(data?.requests || []).slice(0, 5).map((r: any) => (
                <div key={r.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-gray-500">{r.status || "new"} · {r.address || ""}</p>
                </div>
              ))}
            </div>
          </CabinetCard>
          <CabinetCard title="Отзывы">
            <p className="text-sm text-gray-600">Всего: {data?.stats?.reviews_total || 0}</p>
            <p className="text-sm text-gray-600">Средняя оценка: {Number(data?.stats?.avg_rating || 0).toFixed(2)}</p>
          </CabinetCard>
          <CabinetCard title="Статус заявки «Стать мастером»">
            {(data?.become_master_requests || []).length === 0 ? (
              <p className="text-sm text-gray-600">Заявок нет</p>
            ) : (
              (data?.become_master_requests || []).map((b: any) => (
                <p key={b.id} className="text-sm text-gray-600">{b.category}: {b.status}</p>
              ))
            )}
          </CabinetCard>
        </div>
      </div>
    </Layout>
  );
}
