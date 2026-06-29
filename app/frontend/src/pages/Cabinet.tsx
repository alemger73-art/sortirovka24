import { useEffect, useMemo, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Coins, Save, UserCircle2, Wrench, MapPin, Plus, Trash2, Star, Pencil, X, Loader2, CheckCircle2, AlertCircle, Search, Megaphone, EyeOff, Home } from "lucide-react";
import CabinetNav from "@/components/cabinet/CabinetNav";
import CabinetHeader from "@/components/cabinet/CabinetHeader";
import CabinetRoleApplications from "@/components/cabinet/CabinetRoleApplications";
import CabinetOrderCard from "@/components/cabinet/CabinetOrderCard";
import CabinetNotifications from "@/components/cabinet/CabinetNotifications";
import CabinetLockScreen from "@/components/cabinet/CabinetLockScreen";
import CabinetSecurityPanel from "@/components/cabinet/CabinetSecuritySettings";
import {
  loadNotificationPrefs,
  loadSecuritySettings,
  shouldLockCabinet,
  isNotificationCategoryEnabled,
  clearCabinetUnlock,
  type CabinetSecuritySettings,
} from "@/lib/cabinetPreferences";
import { getBiometricSupport, type BiometricSupport } from "@/lib/biometricAuth";
import { accountApi, getAccountToken, type SavedAddress, type UserNotificationItem } from "@/lib/accountApi";
import { cacheAccountProfile, getCurrentUser, logoutLocalUser } from "@/lib/localAuth";
import { humanizeApiError } from "@/lib/apiErrors";
import { STATUS_LABELS, ANN_TYPES } from "@/lib/api";
import { formatExpiryLabel, isAnnouncementExpired, isAnnouncementPromoted } from "@/lib/announcements";
import { isRealEstateExpired, isRealEstatePromoted, resolveReTypeLabel } from "@/lib/realEstate";
import { toast } from "sonner";
import { uploadAvatar, assertImageFileSize } from "@/lib/storage";
import { formatTenge, taxiApi, TAXI_STATUS_LABELS, type TaxiRide, type DriverApplication } from "@/lib/taxiApi";
import { logisticsApi, type CourierAccess } from "@/lib/logisticsApi";
import { useTaxiEnabled } from "@/hooks/useTaxiEnabled";
import { useModules } from "@/hooks/useModules";
import {
  type CabinetTabId,
  DELIVERY_MODULE_KEYS,
  isCabinetTabVisible,
  anyModuleEnabled,
} from "@/config/cabinetTabs";
import { useLanguage } from "@/contexts/LanguageContext";
import TaxiUnavailable from "@/components/taxi/TaxiUnavailable";
import { cabinetOrderDetailPath, orderDetailId, type CabinetOrderRow } from "@/lib/orderRoutes";

type TabId = CabinetTabId;

const MASTER_REQUEST_STATUS: Record<string, { labelKey: string; color: string }> = {
  new: { labelKey: "cabinet.master.statusNew", color: "bg-yellow-500/20 text-yellow-200" },
  in_progress: { labelKey: "cabinet.master.statusInProgress", color: "bg-blue-500/20 text-blue-200" },
  done: { labelKey: "cabinet.master.statusDone", color: "bg-green-500/20 text-green-200" },
};

function formatOrderDate(raw?: string | null) {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(raw);
  }
}

function DarkCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827] dark:shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 dark:border-[#2a3347] dark:bg-[#0f172a] dark:text-white dark:placeholder:text-slate-500";

const listCardClass =
  "rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[#26324a] dark:bg-[#0f172a]";

const sectionTitleClass = "text-xl font-bold text-gray-900 dark:text-white";

const ALL_CABINET_TAB_IDS: TabId[] = [
  "profile",
  "addresses",
  "bonuses",
  "notifications",
  "orders",
  "masterRequests",
  "taxi",
  "complaints",
  "announcements",
  "realEstate",
  "settings",
];

function isCabinetTabId(value: string | null): value is TabId {
  return value !== null && ALL_CABINET_TAB_IDS.includes(value as TabId);
}

export default function Cabinet() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, setLang } = useLanguage();
  const taxiEnabled = useTaxiEnabled();
  const { isEnabled } = useModules();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabId>(
    isCabinetTabId(initialTab) ? initialTab : "profile",
  );
  const [loading, setLoading] = useState(true);
  const [cabinet, setCabinet] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", avatar: "", language: "ru" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [taxiRides, setTaxiRides] = useState<TaxiRide[]>([]);
  const [courierAccess, setCourierAccess] = useState<CourierAccess | null>(null);
  const [driverApplication, setDriverApplication] = useState<DriverApplication | null>(null);
  const [masterNewRequests, setMasterNewRequests] = useState(0);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressForm, setAddressForm] = useState<{
    id: number | null;
    label: string;
    address: string;
    comment: string;
    is_default: boolean;
    lat: number | null;
    lng: number | null;
    display: string;
  } | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [orderFilter, setOrderFilter] = useState<"all" | "food" | "store">("all");
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const seenNotificationIds = useRef<Set<number>>(new Set());
  const [securitySettings, setSecuritySettings] = useState<CabinetSecuritySettings | null>(null);
  const [cabinetLocked, setCabinetLocked] = useState(false);
  const [biometricSupport, setBiometricSupport] = useState<BiometricSupport | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (isCabinetTabId(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const loadMasterNewRequests = async (role?: string) => {
    const r = role || cabinet?.profile?.role;
    if (r !== "master" && r !== "admin" && r !== "superadmin" && r !== "moderator") {
      setMasterNewRequests(0);
      return;
    }
    try {
      const mc = await accountApi.masterCabinet();
      const count = mc?.stats?.new_requests_count ?? (mc?.requests || []).filter((req: { status?: string }) => req.status === "new").length;
      setMasterNewRequests(count);
    } catch {
      setMasterNewRequests(0);
    }
  };

  useEffect(() => {
    (async () => {
      if (!getAccountToken()) {
        navigate("/account");
        return;
      }
      try {
        const data = await accountApi.cabinet();
        setCabinet(data);
        if (Array.isArray(data?.addresses)) setAddresses(data.addresses);
        setHasPassword(data?.profile?.has_password !== false);
        const lang = data?.profile?.language === "kz" ? "kz" : "ru";
        setProfileForm({
          name: data?.profile?.name || "",
          email: data?.profile?.email || "",
          avatar: data?.profile?.avatar || "",
          language: lang,
        });
        if (lang === "kz" || lang === "ru") setLang(lang);
        taxiApi.myRides().then(setTaxiRides).catch(() => {});
        logisticsApi.getCourierAccess().then(setCourierAccess).catch(() => {});
        taxiApi.getDriverApplication().then(setDriverApplication).catch(() => {});
        loadMasterNewRequests(data?.profile?.role).catch(() => {});
      } catch (e: unknown) {
        const cached = getCurrentUser();
        if (cached) {
          setCabinet({
            profile: {
              name: cached.name,
              phone: cached.phone,
              email: cached.email,
              avatar: cached.avatar,
              has_password: true,
              bonus_balance: 0,
            },
            bonuses: [],
            orders: [],
            complaints: [],
            announcements: [],
            real_estate: [],
          });
          setProfileForm({
            name: cached.name || "",
            email: cached.email || "",
            avatar: cached.avatar || "",
            language: "ru",
          });
          setError(t("cabinet.errorOffline"));
        } else {
          setError(humanizeApiError(e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const saveProfile = async () => {
    setSavingProfile(true);
    setError("");
    setSuccess("");
    try {
      const avatarForSave =
        profileForm.avatar?.startsWith("blob:") ? undefined : profileForm.avatar?.trim() || undefined;
      const updated = await accountApi.updateMe({
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || undefined,
        avatar: avatarForSave,
        language: profileForm.language,
      });
      cacheAccountProfile({
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        avatar: updated.avatar,
      });
      const refreshed = await accountApi.cabinet();
      setCabinet(refreshed);
      if (profileForm.language === "kz" || profileForm.language === "ru") {
        setLang(profileForm.language);
      }
      setProfileForm({
        name: refreshed?.profile?.name || "",
        email: refreshed?.profile?.email || "",
        avatar: refreshed?.profile?.avatar || "",
        language: refreshed?.profile?.language || "ru",
      });
      setSuccess(t("cabinet.profileSaved"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    } finally {
      setSavingProfile(false);
    }
  };

  const onAvatarUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("cabinet.errorImageType"));
      return;
    }
    try {
      assertImageFileSize(file);
    } catch (e: unknown) {
      setError(humanizeApiError(e));
      return;
    }
    setAvatarUploading(true);
    setError("");
    setSuccess("");
    const previewUrl = URL.createObjectURL(file);
    setProfileForm((p) => ({ ...p, avatar: previewUrl }));
    try {
      const result = await uploadAvatar(file);
      const url = result.thumbnailUrl || result.downloadUrl;
      if (!url) throw new Error(t("cabinet.errorUploadFailed"));
      const updated = await accountApi.updateMe({
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || undefined,
        avatar: url,
        language: profileForm.language,
      });
      setProfileForm((p) => ({
        ...p,
        avatar: updated.avatar || url,
      }));
      cacheAccountProfile({
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        avatar: updated.avatar,
      });
      setCabinet((prev: any) =>
        prev
          ? { ...prev, profile: { ...prev.profile, avatar: updated.avatar || url } }
          : prev
      );
      setSuccess(t("cabinet.avatarSaved"));
    } catch (e: unknown) {
      setProfileForm((p) => ({
        ...p,
        avatar: cabinet?.profile?.avatar || "",
      }));
      setError(humanizeApiError(e));
    } finally {
      URL.revokeObjectURL(previewUrl);
      setAvatarUploading(false);
    }
  };

  const changePassword = async () => {
    setChangingPassword(true);
    setError("");
    setSuccess("");
    try {
      if (passwordForm.next.length < 8) throw new Error(t("cabinet.errorPasswordShort"));
      if (passwordForm.next !== passwordForm.confirm) throw new Error(t("cabinet.errorPasswordMismatch"));
      if (hasPassword) {
        await accountApi.changePassword({
          current_password: passwordForm.current,
          new_password: passwordForm.next,
        });
        setSuccess(t("cabinet.passwordChanged"));
      } else {
        await accountApi.setPassword({ new_password: passwordForm.next });
        setHasPassword(true);
        setSuccess(t("cabinet.passwordSet"));
      }
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    } finally {
      setChangingPassword(false);
    }
  };

  const refreshAddresses = async () => {
    try {
      const list = await accountApi.listAddresses();
      setAddresses(list);
    } catch {
      // keep current list on failure
    }
  };

  const startAddAddress = () => {
    setError("");
    setSuccess("");
    setGeoError("");
    setAddressForm({ id: null, label: "", address: "", comment: "", is_default: addresses.length === 0, lat: null, lng: null, display: "" });
  };

  const startEditAddress = (a: SavedAddress) => {
    setError("");
    setSuccess("");
    setGeoError("");
    setAddressForm({
      id: a.id,
      label: a.label || "",
      address: a.address || "",
      comment: a.comment || "",
      is_default: a.is_default,
      lat: a.lat ?? null,
      lng: a.lng ?? null,
      display: a.lat != null && a.lng != null ? a.address || "" : "",
    });
  };

  const geocodeAddressForm = async () => {
    if (!addressForm) return;
    if (addressForm.address.trim().length < 3) {
      setGeoError(t("cabinet.addresses.addressRequired"));
      return;
    }
    setGeocoding(true);
    setGeoError("");
    try {
      const res = await accountApi.geocodeAddress(addressForm.address.trim());
      if (!res.found || res.lat == null || res.lng == null) {
        setAddressForm((p) => (p ? { ...p, lat: null, lng: null, display: "" } : p));
        setGeoError(t("cabinet.addresses.geoNotFound"));
        return;
      }
      setAddressForm((p) =>
        p ? { ...p, lat: res.lat ?? null, lng: res.lng ?? null, display: res.display_address || p.address } : p
      );
    } catch (e: unknown) {
      setGeoError(humanizeApiError(e));
    } finally {
      setGeocoding(false);
    }
  };

  const saveAddress = async () => {
    if (!addressForm) return;
    if (addressForm.address.trim().length < 3) {
      setError(t("cabinet.addresses.addressRequired"));
      return;
    }
    setSavingAddress(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        label: addressForm.label.trim(),
        address: addressForm.address.trim(),
        comment: addressForm.comment.trim(),
        is_default: addressForm.is_default,
        lat: addressForm.lat,
        lng: addressForm.lng,
      };
      if (addressForm.id == null) {
        await accountApi.createAddress(payload);
      } else {
        await accountApi.updateAddress(addressForm.id, payload);
      }
      await refreshAddresses();
      setAddressForm(null);
      setSuccess(t("cabinet.addresses.saved"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    } finally {
      setSavingAddress(false);
    }
  };

  const makeDefaultAddress = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await accountApi.setDefaultAddress(id);
      await refreshAddresses();
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const removeAddress = async (id: number) => {
    if (!window.confirm(t("cabinet.addresses.deleteConfirm"))) return;
    setError("");
    setSuccess("");
    try {
      await accountApi.deleteAddress(id);
      await refreshAddresses();
      setSuccess(t("cabinet.addresses.deleted"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const refreshCabinet = async () => {
    const data = await accountApi.cabinet();
    setCabinet(data);
    if (Array.isArray(data?.addresses)) setAddresses(data.addresses);
    await loadMasterNewRequests(data?.profile?.role);
    return data;
  };

  const unpublishAnnouncement = async (id: number) => {
    if (!window.confirm(t("cabinet.announcements.unpublishConfirm"))) return;
    setError("");
    try {
      await accountApi.unpublishMyAnnouncement(id);
      await refreshCabinet();
      toast.success(t("cabinet.announcements.unpublished"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const deleteAnnouncement = async (id: number) => {
    if (!window.confirm(t("cabinet.announcements.deleteConfirm"))) return;
    setError("");
    try {
      await accountApi.deleteMyAnnouncement(id);
      await refreshCabinet();
      toast.success(t("cabinet.announcements.deleted"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const extendAnnouncement = async (id: number) => {
    setError("");
    try {
      await accountApi.extendMyAnnouncement(id);
      await refreshCabinet();
      toast.success(t("cabinet.announcements.extended"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const boostAnnouncement = async (id: number) => {
    setError("");
    try {
      await accountApi.boostMyAnnouncement(id);
      await refreshCabinet();
      toast.success(t("cabinet.announcements.boosted"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const unpublishRealEstate = async (id: number) => {
    if (!window.confirm(t("cabinet.realEstate.unpublishConfirm"))) return;
    setError("");
    try {
      await accountApi.unpublishMyRealEstate(id);
      await refreshCabinet();
      toast.success(t("cabinet.realEstate.unpublished"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const deleteRealEstate = async (id: number) => {
    if (!window.confirm(t("cabinet.realEstate.deleteConfirm"))) return;
    setError("");
    try {
      await accountApi.deleteMyRealEstate(id);
      await refreshCabinet();
      toast.success(t("cabinet.realEstate.deleted"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const extendRealEstate = async (id: number) => {
    setError("");
    try {
      await accountApi.extendMyRealEstate(id);
      await refreshCabinet();
      toast.success(t("cabinet.realEstate.extended"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const boostRealEstate = async (id: number) => {
    setError("");
    try {
      await accountApi.boostMyRealEstate(id);
      await refreshCabinet();
      toast.success(t("cabinet.realEstate.boosted"));
    } catch (e: unknown) {
      setError(humanizeApiError(e));
    }
  };

  const rows = useMemo(() => ({
    bonuses: cabinet?.bonuses || [],
    orders: cabinet?.orders || [],
    master_requests: cabinet?.master_requests || [],
    become_master_requests: cabinet?.become_master_requests || [],
    complaints: cabinet?.complaints || [],
    announcements: cabinet?.announcements || [],
    real_estate: cabinet?.real_estate || [],
  }), [cabinet]);

  const masterApplicationPending = useMemo(
    () => (rows.become_master_requests || []).some((b: { status?: string }) => b.status === "pending"),
    [rows.become_master_requests],
  );

  const filteredOrders = useMemo(() => {
    const orders: CabinetOrderRow[] = rows.orders || [];
    if (orderFilter === "food") return orders.filter((o) => o.type === "food");
    if (orderFilter === "store") {
      return orders.filter((o) => ["volna", "gastronom", "pharmacy", "prorab", "park"].includes(o.type));
    }
    return orders;
  }, [rows.orders, orderFilter]);

  const tabVisibilityCtx = useMemo(
    () => ({
      isEnabled,
      taxiEnabled,
      hasData: {
        addresses: addresses.length > 0,
        orders: rows.orders.length > 0,
        masterRequests: rows.master_requests.length > 0,
        taxi: taxiRides.length > 0,
        complaints: rows.complaints.length > 0,
        announcements: rows.announcements.length > 0,
        realEstate: rows.real_estate.length > 0,
      },
    }),
    [isEnabled, taxiEnabled, addresses.length, rows, taxiRides.length],
  );

  const tabs = useMemo(() => {
    const base: { id: TabId; label: string }[] = [
      { id: "profile", label: t("cabinet.tab.profile") },
      { id: "addresses", label: t("cabinet.tab.addresses") },
      { id: "bonuses", label: t("cabinet.tab.bonuses") },
      { id: "notifications", label: t("cabinet.tab.notifications") },
      { id: "orders", label: t("cabinet.tab.orders") },
      { id: "masterRequests", label: t("cabinet.tab.masterRequests") },
      { id: "taxi", label: t("cabinet.tab.taxi") },
      { id: "complaints", label: t("cabinet.tab.complaints") },
      { id: "announcements", label: t("cabinet.tab.announcements") },
      { id: "realEstate", label: t("cabinet.tab.realEstate") },
      { id: "settings", label: t("cabinet.tab.settings") },
    ];
    return base.filter((tab) => isCabinetTabVisible(tab.id, tabVisibilityCtx));
  }, [tabVisibilityCtx, t]);

  const deliveryEnabled = anyModuleEnabled(DELIVERY_MODULE_KEYS, isEnabled);
  const mastersEnabled = isEnabled("masters");
  const taxiOn = taxiEnabled !== false;
  const isApprovedDriver = Boolean(driverApplication?.is_driver);
  const hasMasterRole =
    cabinet?.profile?.role === "master" ||
    cabinet?.profile?.role === "admin" ||
    cabinet?.profile?.role === "superadmin" ||
    cabinet?.profile?.role === "moderator";
  const hasCourierAccess = Boolean(courierAccess?.can_access_cabinet);
  const hasCourierHistory = Boolean(courierAccess?.status && courierAccess.status !== "none");
  const hasDriverHistory =
    isApprovedDriver || Boolean(driverApplication?.status && driverApplication.status !== "none");
  const hasMasterHistory =
    hasMasterRole || masterApplicationPending || rows.become_master_requests.length > 0;

  const roleVisibility = {
    master: mastersEnabled || hasMasterRole,
    becomeMaster: mastersEnabled && !masterApplicationPending,
    driver: taxiOn || isApprovedDriver,
    becomeDriver: taxiOn && !isApprovedDriver && driverApplication?.status !== "pending",
    courier: deliveryEnabled || hasCourierAccess,
    becomeCourier: deliveryEnabled && !hasCourierAccess && courierAccess?.status !== "pending",
  };

  const showRoles = {
    master: mastersEnabled || hasMasterHistory,
    courier: deliveryEnabled || hasCourierHistory,
    driver: taxiOn || hasDriverHistory,
  };

  const switchTab = (tab: TabId) => {
    setError("");
    setSuccess("");
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "profile") next.delete("tab");
    else next.set("tab", tab);
    navigate({ pathname: "/cabinet", search: next.toString() ? `?${next.toString()}` : "" }, { replace: true });
  };

  const refreshNotifications = async (silent = false) => {
    if (!getAccountToken()) return;
    if (!silent) setNotificationsLoading(true);
    try {
      const data = await accountApi.notifications();
      const prefs = await loadNotificationPrefs();
      setNotifications(data.items || []);
      setUnreadCount(Number(data.unread_count || 0));

      for (const item of data.items || []) {
        if (!item.is_read && !seenNotificationIds.current.has(item.id)) {
          if (!isNotificationCategoryEnabled(item.category, prefs)) continue;
          seenNotificationIds.current.add(item.id);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(item.title, { body: item.body || undefined, icon: "/favicon.ico" });
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore polling errors */
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const [sec, bio] = await Promise.all([loadSecuritySettings(), getBiometricSupport()]);
      setSecuritySettings(sec);
      setBiometricSupport(bio);
      setCabinetLocked(shouldLockCabinet(sec));
    })();
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!securitySettings?.lockEnabled) return;
      if (document.visibilityState === 'hidden') {
        clearCabinetUnlock();
      } else if (document.visibilityState === 'visible') {
        setCabinetLocked(shouldLockCabinet(securitySettings));
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [securitySettings]);

  useEffect(() => {
    if (!getAccountToken()) return;
    void refreshNotifications(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const id = window.setInterval(() => refreshNotifications(true), 30000);
    return () => window.clearInterval(id);
  }, []);

  const markNotificationRead = async (id: number) => {
    try {
      await accountApi.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await accountApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  };

  const tabsWithBadges = useMemo(
    () => tabs.map((tab) => (tab.id === "notifications" ? { ...tab, badge: unreadCount } : tab)),
    [tabs, unreadCount],
  );

  useEffect(() => {
    if (tabs.some((tab) => tab.id === activeTab)) return;
    switchTab("profile");
  }, [tabs, activeTab]);

  if (loading) return <Layout><div className="mx-auto max-w-6xl px-4 py-10 text-gray-500 dark:text-slate-300">{t("cabinet.loading")}</div></Layout>;

  if (cabinetLocked && securitySettings) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-[#0B0F19]">
          <CabinetLockScreen
            biometricAvailable={securitySettings.biometricEnabled && (biometricSupport?.available ?? false)}
            biometricLabel={biometricSupport?.label || t('cabinet.security.biometric')}
            onUnlocked={() => setCabinetLocked(false)}
            title={t('cabinet.security.lockTitle')}
            subtitle={t('cabinet.security.lockSubtitle')}
            pinLabel={t('cabinet.security.enterPin')}
            biometricButton={t('cabinet.security.useBiometric')}
            wrongPin={t('cabinet.security.wrongPin')}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-[#0B0F19] dark:text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <CabinetHeader
              profile={cabinet?.profile}
              ordersCount={(rows.orders || []).length}
              ordersCountLabel={`${(rows.orders || []).length} ${t("cabinet.ordersCount")}`}
              courierAccess={courierAccess}
              driverApplication={driverApplication}
              masterApplicationPending={masterApplicationPending}
              masterNewRequests={masterNewRequests}
              logoutLabel={t("cabinet.logout")}
              bonusLabel={t("cabinet.bonusShort")}
              onLogout={() => {
                logoutLocalUser();
                navigate("/account");
              }}
              onOpenBonuses={() => switchTab("bonuses")}
              onOpenNotifications={() => switchTab("notifications")}
              unreadNotifications={unreadCount}
              links={{
                master: t("cabinet.masterTitle"),
                driver: t("cabinet.driverCabinetLink"),
                courier: t("cabinet.courierCabinetLink"),
                becomeDriver: t("cabinet.becomeDriver"),
                becomeCourier: t("cabinet.becomeCourier"),
                becomeMaster: masterApplicationPending ? undefined : t("masters.becomeMaster"),
                masterPending: t("cabinet.masterPending"),
                courierPending: t("cabinet.courierPending"),
                driverPending: t("cabinet.driverPending"),
              }}
              roleVisibility={roleVisibility}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <CabinetNav tabs={tabsWithBadges} activeTab={activeTab} onTabChange={switchTab} />

            <div className="space-y-4">
              {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p> : null}
              {success ? <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">{success}</p> : null}

              {activeTab === "profile" && (
                <>
                  <CabinetRoleApplications
                    profileRole={cabinet?.profile?.role}
                    becomeMasterRequests={rows.become_master_requests}
                    courierAccess={courierAccess}
                    driverApplication={driverApplication}
                    labels={{
                      title: t("cabinet.roles.title"),
                      master: t("cabinet.roles.master"),
                      courier: t("cabinet.roles.courier"),
                      driver: t("cabinet.roles.driver"),
                      statusNone: t("cabinet.roles.statusNone"),
                      statusPending: t("cabinet.roles.statusPending"),
                      statusApproved: t("cabinet.roles.statusApproved"),
                      statusRejected: t("cabinet.roles.statusRejected"),
                      actionApply: t("cabinet.roles.actionApply"),
                      actionCabinet: t("cabinet.roles.actionCabinet"),
                      masterRequestsHint: t("cabinet.roles.masterRequestsHint"),
                    }}
                    showRoles={showRoles}
                  />
                  {masterApplicationPending && (
                    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/80 dark:bg-indigo-950/20 px-4 py-4">
                      <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{t("cabinet.masterPending")}</p>
                      <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-1">{t("cabinet.master.becomePendingHint")}</p>
                    </div>
                  )}
                <DarkCard>
                  <div className="mb-4 flex items-center justify-between"><h2 className={sectionTitleClass}>{t("cabinet.tab.profile")}</h2></div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-[#2a3347] dark:bg-[#0f172a]">
                      {profileForm.avatar ? (
                        <img src={profileForm.avatar} alt="avatar" className="mx-auto h-28 w-28 rounded-full object-cover ring-2 ring-yellow-400/50" />
                      ) : (
                        <UserCircle2 className="mx-auto h-28 w-28 text-gray-400 dark:text-slate-400" />
                      )}
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-semibold text-[#0B0F19]">
                        <Camera className="h-4 w-4" /> {avatarUploading ? t("cabinet.uploadingPhoto") : t("cabinet.uploadPhoto")}
                        <input type="file" accept="image/*" className="hidden" disabled={avatarUploading} onChange={(e) => onAvatarUpload(e.target.files?.[0])} />
                      </label>
                      {profileForm.avatar ? (
                        <button
                          onClick={async () => {
                            setError("");
                            setSuccess("");
                            try {
                              const updated = await accountApi.updateMe({ avatar: "" });
                              setProfileForm((p) => ({ ...p, avatar: "" }));
                              cacheAccountProfile({
                                id: updated.id,
                                name: updated.name,
                                phone: updated.phone,
                                email: updated.email,
                                avatar: updated.avatar,
                              });
                              setSuccess(t("cabinet.avatarRemoved"));
                            } catch (e: unknown) {
                              setError(humanizeApiError(e));
                            }
                          }}
                          className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#1a2336]"
                        >
                          {t("cabinet.removePhoto")}
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <input value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} placeholder={t("cabinet.placeholderName")} />
                      <input disabled value={cabinet?.profile?.phone || ""} className={`${inputClass} opacity-80`} placeholder={t("cabinet.placeholderPhone")} />
                      <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} placeholder="Email" />
                      <select value={profileForm.language} onChange={e => setProfileForm(p => ({ ...p, language: e.target.value }))} className={inputClass}>
                        <option value="ru">Русский</option>
                        <option value="kz">Қазақша</option>
                      </select>
                      <button onClick={saveProfile} disabled={savingProfile || avatarUploading} className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19] disabled:opacity-60">
                        <Save className="h-4 w-4" /> {savingProfile ? t("cabinet.saving") : t("cabinet.saveProfile")}
                      </button>
                    </div>
                  </div>
                </DarkCard>
                </>
              )}

              {activeTab === "addresses" && (
                <DarkCard>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className={sectionTitleClass}>{t("cabinet.addresses.title")}</h2>
                    {!addressForm && (
                      <button
                        onClick={startAddAddress}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-[#0B0F19]"
                      >
                        <Plus className="h-4 w-4" /> {t("cabinet.addresses.add")}
                      </button>
                    )}
                  </div>
                  <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">{t("cabinet.addresses.hint")}</p>

                  {addressForm && (
                    <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2a3347] dark:bg-[#0f172a]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {addressForm.id == null ? t("cabinet.addresses.add") : t("cabinet.addresses.edit")}
                        </h3>
                        <button onClick={() => setAddressForm(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        value={addressForm.label}
                        onChange={(e) => setAddressForm((p) => (p ? { ...p, label: e.target.value } : p))}
                        className={inputClass}
                        placeholder={t("cabinet.addresses.labelField")}
                      />
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={addressForm.address}
                            onChange={(e) =>
                              setAddressForm((p) => (p ? { ...p, address: e.target.value, lat: null, lng: null, display: "" } : p))
                            }
                            className={`${inputClass} flex-1`}
                            placeholder={t("cabinet.addresses.addressField")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void geocodeAddressForm();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={geocodeAddressForm}
                            disabled={geocoding || addressForm.address.trim().length < 3}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            {t("cabinet.addresses.checkOnMap")}
                          </button>
                        </div>
                        {geoError ? (
                          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{geoError}</span>
                          </div>
                        ) : null}
                        {addressForm.lat != null && addressForm.lng != null ? (
                          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                              <CheckCircle2 className="h-4 w-4" /> {t("cabinet.addresses.geoFound")}
                            </p>
                            {addressForm.display ? (
                              <p className="text-xs text-emerald-700 break-words">{addressForm.display}</p>
                            ) : null}
                            <iframe
                              title="Карта адреса"
                              src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
                                `${addressForm.lng - 0.008},${addressForm.lat - 0.008},${addressForm.lng + 0.008},${addressForm.lat + 0.008}`
                              )}&layer=mapnik&marker=${addressForm.lat}%2C${addressForm.lng}`}
                              className="h-36 w-full rounded-lg border border-emerald-200"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-slate-400">{t("cabinet.addresses.checkHint")}</p>
                        )}
                      </div>
                      <textarea
                        value={addressForm.comment}
                        onChange={(e) => setAddressForm((p) => (p ? { ...p, comment: e.target.value } : p))}
                        className={`${inputClass} min-h-[64px]`}
                        placeholder={t("cabinet.addresses.commentField")}
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={addressForm.is_default}
                          onChange={(e) => setAddressForm((p) => (p ? { ...p, is_default: e.target.checked } : p))}
                          className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                        />
                        {t("cabinet.addresses.makeDefault")}
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={saveAddress}
                          disabled={savingAddress}
                          className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19] disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" /> {savingAddress ? t("cabinet.saving") : t("common.save")}
                        </button>
                        <button
                          onClick={() => setAddressForm(null)}
                          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#1a2336]"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {addresses.length === 0 && !addressForm ? (
                      <p className="text-sm text-slate-400">{t("cabinet.addresses.empty")}</p>
                    ) : null}
                    {addresses.map((a) => (
                      <div key={a.id} className={listCardClass}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {a.label ? (
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{a.label}</p>
                                ) : null}
                                {a.is_default ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                    <Star className="h-3 w-3 fill-current" /> {t("cabinet.addresses.default")}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-sm text-gray-800 dark:text-slate-200 break-words">{a.address}</p>
                              {a.comment ? (
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400 break-words">{a.comment}</p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {!a.is_default ? (
                              <button
                                onClick={() => makeDefaultAddress(a.id)}
                                title={t("cabinet.addresses.setDefault")}
                                className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-emerald-600 dark:hover:bg-[#1a2336]"
                              >
                                <Star className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              onClick={() => startEditAddress(a)}
                              title={t("common.edit")}
                              className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-indigo-600 dark:hover:bg-[#1a2336]"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => removeAddress(a.id)}
                              title={t("common.delete")}
                              className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-red-600 dark:hover:bg-[#1a2336]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </DarkCard>
              )}

              {activeTab === "bonuses" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">{t("cabinet.myBonuses")}</h2>
                  <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-5 dark:border-yellow-400/30 dark:from-yellow-500/20 dark:via-amber-500/10 dark:to-orange-500/5">
                    <p className="text-sm text-amber-800/80 dark:text-yellow-100/80">{t("cabinet.bonusBalance")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Coins className="h-7 w-7 text-amber-600 dark:text-yellow-300" />
                      <p className="text-4xl font-black text-amber-700 dark:text-yellow-300">{Number(cabinet?.profile?.bonus_balance || 0).toLocaleString("ru-RU")}</p>
                    </div>
                    <p className="mt-1 text-sm text-amber-900/70 dark:text-yellow-100/70">{t("cabinet.bonusHint")}</p>
                    <Link
                      to="/food"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      {t("cabinet.spendBonusesCta")}
                    </Link>
                  </div>
                  <div className="mt-4 space-y-2">
                    {rows.bonuses.length === 0 ? (
                      <p className="text-sm text-slate-400">{t("cabinet.noBonuses")}</p>
                    ) : null}
                    {rows.bonuses.map((entry: any) => (
                      <div key={entry.id} className={listCardClass}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-900 dark:text-white">{entry.reason || t("cabinet.bonusReason")}</p>
                          <p className="font-semibold text-amber-600 dark:text-yellow-300">{entry.points > 0 ? "+" : ""}{entry.points}</p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{entry.created_at || ""}</p>
                      </div>
                    ))}
                  </div>
                </DarkCard>
              )}

              {activeTab === "notifications" && (
                <DarkCard>
                  <CabinetNotifications
                    items={notifications}
                    loading={notificationsLoading}
                    unreadCount={unreadCount}
                    onMarkRead={markNotificationRead}
                    onMarkAllRead={markAllNotificationsRead}
                    title={t("cabinet.tab.notifications")}
                    emptyLabel={t("cabinet.notifications.empty")}
                    markAllLabel={t("cabinet.notifications.markAll")}
                  />
                </DarkCard>
              )}

              {activeTab === "orders" && (
                <DarkCard>
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className={sectionTitleClass}>{t("cabinet.tab.orders")}</h2>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["all", t("cabinet.orders.filterAll")],
                        ["food", t("cabinet.orders.filterFood")],
                        ["store", t("cabinet.orders.filterStores")],
                      ] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setOrderFilter(key)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            orderFilter === key
                              ? "bg-amber-400 text-[#0B0F19]"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#0f172a] dark:text-slate-300 dark:hover:bg-[#1a2336]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {filteredOrders.map((o: CabinetOrderRow) => {
                      const detail = orderDetailId(o);
                      const detailPath = detail ? cabinetOrderDetailPath(detail.source, detail.id) : null;
                      return (
                        <CabinetOrderCard
                          key={o.id}
                          order={o}
                          detailPath={detailPath}
                          t={t}
                        />
                      );
                    })}
                    {filteredOrders.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center dark:border-[#26324a] dark:bg-[#0f172a]">
                        <p className="text-sm text-gray-500 dark:text-slate-400">{t("cabinet.noOrders")}</p>
                        <Link to="/food" className="mt-3 inline-block text-sm font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400">
                          {t("cabinet.orders.goToFood")} →
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "masterRequests" && (
                <DarkCard>
                  <h2 className={`mb-4 ${sectionTitleClass}`}>{t("cabinet.tab.masterRequests")}</h2>
                  <div className="space-y-2">
                    {(rows.master_requests || []).map((r: any) => {
                      const st = MASTER_REQUEST_STATUS[r.status] || MASTER_REQUEST_STATUS.new;
                      return (
                        <div key={r.id} className={listCardClass}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Wrench className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.category || t("cabinet.master.requests")}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${st.color}`}>
                              {t(st.labelKey)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{r.problem_description}</p>
                          {r.master_id ? (
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{t("cabinet.master.personalRequest")} #{r.master_id}</p>
                          ) : null}
                          {r.created_at ? <p className="text-xs text-gray-400 mt-1">{formatOrderDate(r.created_at)}</p> : null}
                        </div>
                      );
                    })}
                    {(rows.master_requests || []).length === 0 ? (
                      <p className="text-sm text-slate-400">{t("cabinet.masterRequestsEmpty")}</p>
                    ) : null}
                  </div>
                  <Link to="/masters/request" className="mt-4 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                    {t("masters.emptyCtaRequest")} →
                  </Link>
                </DarkCard>
              )}

              {activeTab === "taxi" && (
                <DarkCard>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold">{t("cabinet.tab.taxi")}</h2>
                    {taxiEnabled !== false ? (
                      <Link to="/taxi" className="text-sm font-semibold text-yellow-400 hover:text-yellow-300">{t("cabinet.orderNow")} →</Link>
                    ) : null}
                  </div>
                  {taxiEnabled === false && taxiRides.length === 0 ? (
                    <TaxiUnavailable compact />
                  ) : (
                  <div className="space-y-2">
                    {taxiRides.map((r) => (
                      <Link key={r.id} to={`/taxi/ride/${r.id}`} className={`block ${listCardClass} hover:border-yellow-400/40 transition-colors`}>
                        <div className="flex justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.from_address}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TAXI_STATUS_LABELS[r.status]?.color || "bg-gray-100"}`}>
                            {TAXI_STATUS_LABELS[r.status]?.labelKey ? t(TAXI_STATUS_LABELS[r.status].labelKey) : r.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">→ {r.to_address}</p>
                        <p className="text-xs text-amber-600 dark:text-yellow-300 mt-1">{formatTenge(r.final_price ?? r.estimated_price)}</p>
                      </Link>
                    ))}
                    {taxiRides.length === 0 ? <p className="text-sm text-slate-400">{t("cabinet.noTaxi")}</p> : null}
                  </div>
                  )}
                </DarkCard>
              )}

              {activeTab === "complaints" && (
                <DarkCard>
                  <h2 className="mb-4 text-xl font-bold">{t("cabinet.tab.complaints")}</h2>
                  <div className="space-y-2">
                    {(rows.complaints || []).map((c: any) => (
                      <div key={c.id} className={listCardClass}>
                        <p className="font-semibold text-gray-900 dark:text-white">{c.category || t("cabinet.complaintDefault")}</p>
                        <p className="text-xs text-gray-600 dark:text-slate-400">{c.description || ""}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-500">{t("cabinet.statusLabel")}: {c.status || "-"}</p>
                      </div>
                    ))}
                    {(rows.complaints || []).length === 0 ? <p className="text-sm text-slate-400">{t("cabinet.noComplaints")}</p> : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "announcements" && (
                <DarkCard>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className={sectionTitleClass}>{t("cabinet.tab.announcements")}</h2>
                    <Link
                      to="/announcements/new"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
                    >
                      <Megaphone className="h-4 w-4" />
                      {t("cabinet.announcements.create")}
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {(rows.announcements || []).map((a: any) => {
                      const statusMeta = STATUS_LABELS[a.status] || { label: a.status || "-", color: "bg-gray-100 text-gray-800" };
                      const isPublished = ["approved", "published"].includes(a.status);
                      return (
                        <div key={a.id} className={listCardClass}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 dark:text-white">{a.title || t("cabinet.announcementDefault")}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.color}`}>
                                  {statusMeta.label}
                                </span>
                                {a.ann_type ? (
                                  <span className="text-xs text-amber-600 dark:text-yellow-300">{ANN_TYPES[a.ann_type] || a.ann_type}</span>
                                ) : null}
                              </div>
                              {a.price ? <p className="mt-1 text-sm text-amber-600 dark:text-yellow-300">{a.price}</p> : null}
                              {a.address ? <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">{a.address}</p> : null}
                              {a.expires_at ? (
                                <p className={`mt-1 text-xs ${isAnnouncementExpired(a) ? 'text-red-500' : 'text-gray-500 dark:text-slate-500'}`}>
                                  {isAnnouncementExpired(a) ? t("cabinet.announcements.expired") : `${t("cabinet.announcements.activeUntil")} ${formatExpiryLabel(a.expires_at)}`}
                                </p>
                              ) : null}
                              {isAnnouncementPromoted(a) ? (
                                <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                  {a.promotion_tier === 'vip' ? 'VIP' : 'Топ'} {t("cabinet.announcements.until")} {formatExpiryLabel(a.promoted_until)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                to={`/announcements/${a.id}`}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#111827]"
                              >
                                {t("cabinet.announcements.view")}
                              </Link>
                              <Link
                                to={`/announcements/${a.id}/edit`}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-yellow-200 dark:hover:bg-amber-500/10"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t("cabinet.announcements.edit")}
                              </Link>
                              {isPublished ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => boostAnnouncement(Number(a.id))}
                                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-200 dark:hover:bg-blue-500/10"
                                  >
                                    {t("cabinet.announcements.boost")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => unpublishAnnouncement(Number(a.id))}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#111827]"
                                  >
                                    <EyeOff className="h-3.5 w-3.5" />
                                    {t("cabinet.announcements.unpublish")}
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => extendAnnouncement(Number(a.id))}
                                className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-500/30 dark:text-green-200 dark:hover:bg-green-500/10"
                              >
                                {t("cabinet.announcements.extend")}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAnnouncement(Number(a.id))}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t("cabinet.announcements.delete")}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(rows.announcements || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center dark:border-[#2a3347]">
                        <p className="text-sm text-slate-400">{t("cabinet.noAnnouncements")}</p>
                        <Link to="/announcements/new" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-600 hover:text-amber-700">
                          <Megaphone className="h-4 w-4" />
                          {t("cabinet.announcements.createFirst")}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "realEstate" && (
                <DarkCard>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className={sectionTitleClass}>{t("cabinet.tab.realEstate")}</h2>
                    <Link
                      to="/real-estate/new"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      <Home className="h-4 w-4" />
                      {t("cabinet.realEstate.create")}
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {(rows.real_estate || []).map((r: any) => {
                      const statusMeta = STATUS_LABELS[r.status] || { label: r.status || "-", color: "bg-gray-100 text-gray-800" };
                      const isPublished = ["approved", "published"].includes(r.status);
                      const typeLabel = resolveReTypeLabel(r, []);
                      return (
                        <div key={r.id} className={listCardClass}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 dark:text-white">{r.title || t("cabinet.realEstate.default")}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.color}`}>
                                  {statusMeta.label}
                                </span>
                                {typeLabel ? (
                                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                                    {typeLabel}
                                  </span>
                                ) : null}
                                {r.price ? <span className="text-xs font-semibold text-emerald-600">{r.price}</span> : null}
                              </div>
                              {r.expires_at ? (
                                <p className={`mt-1 text-xs ${isRealEstateExpired(r) ? "text-red-500" : "text-gray-500 dark:text-slate-500"}`}>
                                  {isRealEstateExpired(r) ? t("cabinet.realEstate.expired") : `${t("cabinet.realEstate.activeUntil")} ${formatExpiryLabel(r.expires_at)}`}
                                </p>
                              ) : null}
                              {isRealEstatePromoted(r) && r.promoted_until ? (
                                <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">
                                  {r.promotion_tier === "vip" ? "VIP" : "Топ"} {t("cabinet.realEstate.until")} {formatExpiryLabel(r.promoted_until)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link
                                to={`/real-estate/${r.id}`}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#111827]"
                              >
                                {t("cabinet.realEstate.view")}
                              </Link>
                              <Link
                                to={`/real-estate/${r.id}/edit`}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t("cabinet.realEstate.edit")}
                              </Link>
                              {isPublished ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => boostRealEstate(Number(r.id))}
                                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-200 dark:hover:bg-blue-500/10"
                                  >
                                    {t("cabinet.realEstate.boost")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => unpublishRealEstate(Number(r.id))}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#111827]"
                                  >
                                    <EyeOff className="h-3.5 w-3.5" />
                                    {t("cabinet.realEstate.unpublish")}
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => extendRealEstate(Number(r.id))}
                                className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-500/30 dark:text-green-200 dark:hover:bg-green-500/10"
                              >
                                {t("cabinet.realEstate.extend")}
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRealEstate(Number(r.id))}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t("cabinet.realEstate.delete")}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(rows.real_estate || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center dark:border-[#2a3347]">
                        <p className="text-sm text-slate-400">{t("cabinet.noRealEstate")}</p>
                        <Link to="/real-estate/new" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
                          <Home className="h-4 w-4" />
                          {t("cabinet.realEstate.createFirst")}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </DarkCard>
              )}

              {activeTab === "settings" && (
                <DarkCard>
                  <h2 className={`mb-4 ${sectionTitleClass}`}>{t("cabinet.tab.settings")}</h2>
                  <CabinetSecurityPanel
                    t={t}
                    onSettingsChange={(sec) => {
                      setSecuritySettings(sec);
                      setCabinetLocked(false);
                    }}
                  />
                  <div className="my-6 border-t border-gray-200 dark:border-[#26324a]" />
                  <div className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[#2a3347] dark:bg-[#0f172a]">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{hasPassword ? t("cabinet.changePassword") : t("cabinet.setPassword")}</h3>
                    {hasPassword ? (
                      <input
                        type="password"
                        value={passwordForm.current}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                        className={inputClass}
                        placeholder={t("cabinet.placeholderCurrentPassword")}
                        autoComplete="current-password"
                      />
                    ) : null}
                    <input
                      type="password"
                      value={passwordForm.next}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                      className={inputClass}
                      placeholder={t("cabinet.placeholderNewPassword")}
                      autoComplete="new-password"
                    />
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                      className={inputClass}
                      placeholder={t("cabinet.placeholderConfirmPassword")}
                      autoComplete="new-password"
                    />
                    <button
                      onClick={changePassword}
                      disabled={changingPassword}
                      className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-[#0B0F19] disabled:opacity-60"
                    >
                      {changingPassword ? t("cabinet.saving") : hasPassword ? t("cabinet.changePassword") : t("cabinet.setPassword")}
                    </button>
                  </div>
                  <p className="mb-5 text-sm text-gray-600 dark:text-slate-300">{t("cabinet.langHint")}</p>
                  <button
                    onClick={() => {
                      logoutLocalUser();
                      navigate("/account");
                    }}
                    className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    {t("cabinet.logoutAccount")}
                  </button>
                </DarkCard>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
