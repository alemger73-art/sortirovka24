import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import CabinetCard from "@/components/cabinet/CabinetCard";
import ImageUpload from "@/components/ImageUpload";
import MultiImageUpload from "@/components/MultiImageUpload";
import StorageImg from "@/components/StorageImg";
import { Switch } from "@/components/ui/switch";
import { accountApi } from "@/lib/accountApi";
import { invalidateEntityCache } from "@/lib/cache";
import { useLanguage } from "@/contexts/LanguageContext";
import { ExternalLink, Star, Phone } from "lucide-react";

export default function CabinetMaster() {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [form, setForm] = useState({
    description: "",
    services: "",
    whatsapp: "",
    telegram: "",
    photo_url: "",
    gallery_images: "",
    available_today: false,
  });

  const requestStatusLabel = (status: string) => {
    if (status === "in_progress") return t("cabinet.master.statusInProgress");
    if (status === "done") return t("cabinet.master.statusDone");
    return t("cabinet.master.statusNew");
  };

  const becomeStatus = (status: string) => {
    if (status === "approved") return { label: t("cabinet.master.becomeApproved"), color: "text-green-600" };
    if (status === "rejected") return { label: t("cabinet.master.becomeRejected"), color: "text-red-600" };
    return { label: t("cabinet.master.becomePending"), color: "text-amber-600" };
  };

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
      available_today: Boolean(res?.profile?.available_today),
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
        available_today: form.available_today,
      });
      setSuccess(t("cabinet.master.profileSaved"));
      invalidateEntityCache("masters");
      await loadCabinet();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const updateRequestStatus = async (requestId: number, status: "in_progress" | "done") => {
    setStatusUpdating(requestId);
    setError("");
    try {
      await accountApi.updateMasterRequestStatus(requestId, status);
      await loadCabinet();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setStatusUpdating(null);
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
                <ExternalLink className="w-4 h-4" /> {t("cabinet.master.catalogLink")}
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
            <p className="text-gray-700 dark:text-gray-300 mb-2 font-medium">{t("cabinet.master.noListing")}</p>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">{t("cabinet.master.noListingHint")}</p>
            <Link
              to="/masters/become"
              className="inline-flex items-center justify-center bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700"
            >
              {t("masters.becomeMaster")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <CabinetCard title={t("cabinet.master.photosTitle")} subtitle={t("cabinet.master.photosSubtitle")}>
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">{t("cabinet.master.profilePhoto")}</p>
                    <ImageUpload
                      value={form.photo_url}
                      onChange={(key) => setForm((f) => ({ ...f, photo_url: key }))}
                      folder="masters"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">{t("cabinet.master.gallery")}</p>
                    <MultiImageUpload
                      value={form.gallery_images}
                      onChange={(keys) => setForm((f) => ({ ...f, gallery_images: keys }))}
                      folder="masters-gallery"
                      maxImages={10}
                    />
                  </div>
                </div>
              </CabinetCard>

              <CabinetCard title={t("cabinet.master.aboutTitle")} subtitle={(data?.profile?.service_categories || []).join(", ")}>
                <div className="space-y-3">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-slate-500"
                    rows={5}
                    placeholder={t("cabinet.master.aboutPlaceholder")}
                  />
                  <input
                    value={form.services}
                    onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-slate-500"
                    placeholder={t("cabinet.master.servicesPlaceholder")}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={form.whatsapp}
                      onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-slate-500"
                      placeholder="WhatsApp"
                    />
                    <input
                      value={form.telegram}
                      onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-slate-500"
                      placeholder="Telegram @username"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{t("cabinet.master.availableToday")}</p>
                      <p className="text-xs text-gray-500">{t("cabinet.master.availableTodayHint")}</p>
                    </div>
                    <Switch
                      checked={form.available_today}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, available_today: v }))}
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {saving ? t("cabinet.saving") : t("cabinet.master.saveProfile")}
                  </button>
                </div>
              </CabinetCard>
            </div>

            <div className="space-y-4">
              <CabinetCard title={t("cabinet.master.stats")}>
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
                      {Number(data?.stats?.avg_rating || 0).toFixed(1)} · {data?.stats?.reviews_total || 0} {t("cabinet.master.reviewsCount")}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-300">{t("cabinet.master.requestsCount")}: <strong className="text-gray-900 dark:text-white">{data?.stats?.requests_total || 0}</strong></p>
                {data?.profile?.verified && (
                  <p className="text-sm text-green-600 mt-1">{t("cabinet.master.verified")}</p>
                )}
              </CabinetCard>

              <CabinetCard title={t("cabinet.master.requests")}>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(data?.requests || []).slice(0, 10).map((r: any) => (
                    <div key={r.id} className="rounded-xl border border-gray-100 px-3 py-2.5 text-sm dark:border-gray-800">
                      <p className="font-semibold">{r.title}</p>
                      <p className="text-gray-500 text-xs line-clamp-2 mt-0.5">{r.problem_description}</p>
                      {r.master_id ? (
                        <p className="text-xs text-purple-600 mt-0.5">{t("cabinet.master.personalRequest")} · #{r.master_id}</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">{t("cabinet.master.categoryRequest")}</p>
                      )}
                      <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{requestStatusLabel(r.status)}</span>
                        <div className="flex items-center gap-2">
                          {r.status === "new" && (
                            <button
                              type="button"
                              disabled={statusUpdating === r.id}
                              onClick={() => updateRequestStatus(r.id, "in_progress")}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                            >
                              {t("cabinet.master.takeRequest")}
                            </button>
                          )}
                          {r.status === "in_progress" && (
                            <button
                              type="button"
                              disabled={statusUpdating === r.id}
                              onClick={() => updateRequestStatus(r.id, "done")}
                              className="text-xs font-bold text-green-600 hover:text-green-700 disabled:opacity-50"
                            >
                              {t("cabinet.master.completeRequest")}
                            </button>
                          )}
                          {r.phone && (
                            <a href={`tel:${r.phone}`} className="text-xs text-indigo-600 flex items-center gap-0.5">
                              <Phone className="w-3 h-3" /> {t("cabinet.master.callClient")}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(data?.requests || []).length === 0 && (
                    <p className="text-sm text-gray-500 py-4 text-center">{t("cabinet.master.noRequests")}</p>
                  )}
                </div>
              </CabinetCard>

              <CabinetCard title={t("cabinet.master.becomeSection")}>
                {(data?.become_master_requests || []).length === 0 ? (
                  <p className="text-sm text-gray-500">{t("cabinet.master.noBecomeRequests")}</p>
                ) : (
                  (data?.become_master_requests || []).map((b: any) => {
                    const st = becomeStatus(b.status);
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
