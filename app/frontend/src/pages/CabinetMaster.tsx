import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import ImageUpload from "@/components/ImageUpload";
import MultiImageUpload from "@/components/MultiImageUpload";
import StorageImg from "@/components/StorageImg";
import { accountApi } from "@/lib/accountApi";
import { useLanguage } from "@/contexts/LanguageContext";
import { ExternalLink, Star, Phone } from "lucide-react";

const REQUEST_STATUS: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Выполнено",
};

const BECOME_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "На рассмотрении", color: "text-amber-600" },
  approved: { label: "Одобрено", color: "text-green-600" },
  rejected: { label: "Отклонено", color: "text-red-600" },
};

export default function CabinetMaster() {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    services: "",
    whatsapp: "",
    telegram: "",
    photo_url: "",
    gallery_images: "",
  });

  const loadCabinet = async () => {
    const res = await accountApi.masterCabinet();
    setData(res);
    setForm({
      description: res?.profile?.bio || "",
      services: res?.profile?.services || (res?.profile?.service_categories || []).join(", "),
      whatsapp: res?.profile?.whatsapp || "",
      telegram: res?.profile?.telegram || "",
      photo_url: res?.profile?.photo_url || "",
      gallery_images: res?.profile?.gallery_images || "",
    });
  };

  useEffect(() => {
    (async () => {
      try {
        await loadCabinet();
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
        photo_url: form.photo_url || undefined,
        gallery_images: form.gallery_images || undefined,
      });
      setSuccess("Профиль обновлён — изменения сразу видны в каталоге");
      await loadCabinet();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const listingId = data?.profile?.listing_id;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("cabinet.masterTitle")}</h1>
            {data?.profile?.name && (
              <p className="text-sm text-gray-500 mt-0.5">{data.profile.name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {listingId && (
              <Link
                to={`/masters/${listingId}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <ExternalLink className="w-4 h-4" /> Карточка в каталоге
              </Link>
            )}
            <Link to="/cabinet" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
              ← {t("cabinet.personalTitle")}
            </Link>
          </div>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
        {success ? <p className="mb-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{success}</p> : null}

        {!listingId ? (
          <div className="rounded-3xl border border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-8 text-center">
            <p className="text-gray-700 dark:text-gray-300 mb-2 font-medium">Карточка мастера ещё не создана</p>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
              Подайте заявку «Стать мастером». После одобрения администратором вы сможете редактировать профиль здесь.
            </p>
            <Link
              to="/masters/become"
              className="inline-flex items-center justify-center bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700"
            >
              Стать мастером
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Profile editor — 2 cols */}
            <div className="lg:col-span-2 space-y-4">
              <CabinetCard title="Фото и галерея" subtitle="Клиенты чаще звонят мастерам с фото">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Фото профиля</p>
                    <ImageUpload
                      value={form.photo_url}
                      onChange={(key) => setForm((f) => ({ ...f, photo_url: key }))}
                      folder="masters"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Примеры работ (до 10 фото)</p>
                    <MultiImageUpload
                      value={form.gallery_images}
                      onChange={(keys) => setForm((f) => ({ ...f, gallery_images: keys }))}
                      folder="masters-gallery"
                      maxImages={10}
                    />
                  </div>
                </div>
              </CabinetCard>

              <CabinetCard title="Описание и услуги" subtitle={(data?.profile?.service_categories || []).join(", ")}>
                <div className="space-y-3">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    rows={5}
                    placeholder="Расскажите о своём опыте, ценах, условиях выезда..."
                  />
                  <input
                    value={form.services}
                    onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                    placeholder="Услуги через запятую: установка, ремонт, замена..."
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={form.whatsapp}
                      onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      placeholder="WhatsApp"
                    />
                    <input
                      value={form.telegram}
                      onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      placeholder="Telegram @username"
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {saving ? t("cabinet.saving") : "Сохранить и обновить каталог"}
                  </button>
                </div>
              </CabinetCard>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <CabinetCard title="Статистика">
                <div className="flex items-center gap-3 mb-3">
                  {form.photo_url ? (
                    <StorageImg objectKey={form.photo_url} alt="" className="w-14 h-14 rounded-2xl object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl">🔧</div>
                  )}
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{data?.profile?.name || "—"}</p>
                    <div className="flex items-center gap-1 text-sm text-amber-600">
                      <Star className="w-4 h-4 fill-amber-400" />
                      {Number(data?.stats?.avg_rating || 0).toFixed(1)} · {data?.stats?.reviews_total || 0} отзывов
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600">Заявок: <strong>{data?.stats?.requests_total || 0}</strong></p>
                {data?.profile?.verified && (
                  <p className="text-sm text-green-600 mt-1">✓ Проверенный мастер</p>
                )}
              </CabinetCard>

              <CabinetCard title="Заявки клиентов">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(data?.requests || []).slice(0, 10).map((r: any) => (
                    <div key={r.id} className="rounded-xl border border-gray-100 px-3 py-2.5 text-sm dark:border-gray-800">
                      <p className="font-semibold">{r.title}</p>
                      <p className="text-gray-500 text-xs line-clamp-2 mt-0.5">{r.problem_description}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs text-gray-400">{REQUEST_STATUS[r.status] || r.status}</span>
                        {r.phone && (
                          <a href={`tel:${r.phone}`} className="text-xs text-indigo-600 flex items-center gap-0.5">
                            <Phone className="w-3 h-3" /> Позвонить
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {(data?.requests || []).length === 0 && (
                    <p className="text-sm text-gray-500 py-4 text-center">Пока нет заявок</p>
                  )}
                </div>
              </CabinetCard>

              <CabinetCard title="Заявка «Стать мастером»">
                {(data?.become_master_requests || []).length === 0 ? (
                  <p className="text-sm text-gray-500">Заявок нет</p>
                ) : (
                  (data?.become_master_requests || []).map((b: any) => {
                    const st = BECOME_STATUS[b.status] || BECOME_STATUS.pending;
                    return (
                      <p key={b.id} className={`text-sm font-medium ${st.color}`}>
                        {b.category}: {st.label}
                      </p>
                    );
                  })
                )}
              </CabinetCard>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
