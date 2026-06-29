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
import { ExternalLink, Star, Phone, MapPin, Clock, Bell, CheckCircle2, Loader2 } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

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
    if (status === "approved") return { label: t("cabinet.master.becomeApproved"), color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900" };
    if (status === "rejected") return { label: t("cabinet.master.becomeRejected"), color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900" };
    return { label: t("cabinet.master.becomePending"), color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900" };
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

    const onFocus = () => {
      loadCabinet().catch(() => {});
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadCabinet().catch(() => {});
      }
    }, 45_000);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
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
  const requests = data?.requests || [];
  const newRequestsCount = data?.stats?.new_requests_count ?? requests.filter((r: any) => r.status === "new").length;
  const becomeRequests = data?.become_master_requests || [];
  const latestBecome = becomeRequests[0];

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1">
              {t("cabinet.master.badge")}
            </p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("cabinet.masterTitle")}</h1>
            {data?.profile?.name && (
              <p className="text-sm text-gray-500 mt-0.5">{data.profile.name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {listingId && (
              <Link
                to={`/masters/${listingId}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <ExternalLink className="w-4 h-4" /> {t("cabinet.master.catalogLink")}
              </Link>
            )}
            <Link to="/cabinet" className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
              ← {t("cabinet.personalTitle")}
            </Link>
          </div>
        </div>

        {error ? <p className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
        {success ? <p className="mb-3 rounded-xl bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm text-green-600 dark:text-green-300">{success}</p> : null}

        {!listingId ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-dashed border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-gray-900 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mx-auto mb-4 text-3xl">🔧</div>
              <p className="text-gray-800 dark:text-gray-200 mb-2 font-semibold text-lg">{t("cabinet.master.noListing")}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto leading-relaxed">{t("cabinet.master.noListingHint")}</p>
              {!latestBecome ? (
                <Link
                  to="/masters/become"
                  className="inline-flex items-center justify-center bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200/50 dark:shadow-none"
                >
                  {t("masters.becomeMaster")}
                </Link>
              ) : null}
            </div>

            {latestBecome && (
              <div className={`rounded-2xl border p-5 ${becomeStatus(latestBecome.status).bg}`}>
                <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">{t("cabinet.master.becomeSection")}</p>
                <p className={`text-sm font-semibold ${becomeStatus(latestBecome.status).color}`}>
                  {latestBecome.category}: {becomeStatus(latestBecome.status).label}
                </p>
                {latestBecome.status === "pending" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t("cabinet.master.becomePendingHint")}</p>
                )}
                {latestBecome.status === "rejected" && (
                  <Link to="/masters/become" className="inline-flex mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-700">
                    {t("cabinet.master.becomeRetry")} →
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              {newRequestsCount > 0 && (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                      {t("cabinet.master.newRequestsBanner").replace("{count}", String(newRequestsCount))}
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{t("cabinet.master.newRequestsHint")}</p>
                  </div>
                </div>
              )}

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
                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {saving ? t("cabinet.saving") : t("cabinet.master.saveProfile")}
                  </button>
                </div>
              </CabinetCard>
            </div>

            <div className="space-y-4">
              <CabinetCard title={t("cabinet.master.stats")}>
                <div className="flex items-center gap-3 mb-4">
                  {form.photo_url ? (
                    <StorageImg objectKey={form.photo_url} alt="" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-indigo-100 dark:ring-indigo-900" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-2xl">🔧</div>
                  )}
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{data?.profile?.name || "—"}</p>
                    <div className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                      <Star className="w-4 h-4 fill-amber-400" />
                      {Number(data?.stats?.avg_rating || 0).toFixed(1)} · {data?.stats?.reviews_total || 0} {t("cabinet.master.reviewsCount")}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-950/50 px-3 py-2.5 text-center">
                    <p className="text-lg font-black text-gray-900 dark:text-white">{data?.stats?.requests_total || 0}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{t("cabinet.master.requestsCount")}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-center">
                    <p className="text-lg font-black text-amber-700 dark:text-amber-300">{newRequestsCount}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{t("cabinet.master.statusNew")}</p>
                  </div>
                </div>
                {data?.profile?.verified && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-3 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> {t("cabinet.master.verified")}
                  </p>
                )}
              </CabinetCard>

              <CabinetCard title={t("cabinet.master.requests")} subtitle={newRequestsCount > 0 ? t("cabinet.master.requestsSubtitleNew") : undefined}>
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-0.5">
                  {requests.map((r: any) => {
                    const statusClass = STATUS_STYLES[r.status] || STATUS_STYLES.new;
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border px-3.5 py-3 text-sm transition-colors ${
                          r.status === "new"
                            ? "border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/10"
                            : "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="font-bold text-gray-900 dark:text-white">{r.title || r.category}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusClass}`}>
                            {requestStatusLabel(r.status)}
                          </span>
                        </div>
                        {r.client_name && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{r.client_name}</p>
                        )}
                        <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-2 mt-1 leading-relaxed">{r.problem_description}</p>
                        {r.address && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" /> {r.address}
                          </p>
                        )}
                        {r.created_at && (
                          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {r.created_at}
                          </p>
                        )}
                        <p className="text-[10px] mt-1.5 font-medium">
                          {r.master_id ? (
                            <span className="text-purple-600 dark:text-purple-400">{t("cabinet.master.personalRequest")}</span>
                          ) : (
                            <span className="text-gray-400">{t("cabinet.master.categoryRequest")}</span>
                          )}
                        </p>
                        <div className="flex items-center justify-end mt-2.5 gap-2 flex-wrap">
                          {r.status === "new" && (
                            <button
                              type="button"
                              disabled={statusUpdating === r.id}
                              onClick={() => updateRequestStatus(r.id, "in_progress")}
                              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {statusUpdating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              {t("cabinet.master.takeRequest")}
                            </button>
                          )}
                          {r.status === "in_progress" && (
                            <button
                              type="button"
                              disabled={statusUpdating === r.id}
                              onClick={() => updateRequestStatus(r.id, "done")}
                              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {statusUpdating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              {t("cabinet.master.completeRequest")}
                            </button>
                          )}
                          {r.phone && (
                            <a
                              href={`tel:${r.phone}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                            >
                              <Phone className="w-3 h-3" /> {t("cabinet.master.callClient")}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {requests.length === 0 && (
                    <div className="text-center py-8">
                      <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">{t("cabinet.master.noRequests")}</p>
                      <p className="text-xs text-gray-400 mt-1">{t("cabinet.master.noRequestsHint")}</p>
                    </div>
                  )}
                </div>
              </CabinetCard>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
