import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import AppWelcomeSplash from "@/components/AppWelcomeSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AuthGateLoader from "@/components/AuthGateLoader";
import RequireCabinetRole from "@/components/RequireCabinetRole";
import RequireUserAuth from "@/components/RequireUserAuth";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { getAccountToken } from "@/lib/accountApi";
import { refreshAccountProfile } from "@/lib/localAuth";

// Critical path — loaded eagerly (homepage)
import Index from "./pages/Index";

// Lazy-loaded pages via named export wrappers
const MastersCatalog = lazy(() => import("./pages/Masters").then(m => ({ default: m.MastersCatalog })));
const MasterDetail = lazy(() => import("./pages/Masters").then(m => ({ default: m.MasterDetail })));
const MasterRequestForm = lazy(() => import("./pages/Masters").then(m => ({ default: m.MasterRequestForm })));
const BecomeMasterForm = lazy(() => import("./pages/Masters").then(m => ({ default: m.BecomeMasterForm })));

const NewsList = lazy(() => import("./pages/Content").then(m => ({ default: m.NewsList })));
const NewsDetail = lazy(() => import("./pages/Content").then(m => ({ default: m.NewsDetail })));
const ComplaintsList = lazy(() => import("./pages/Content").then(m => ({ default: m.ComplaintsList })));
const NewComplaintForm = lazy(() => import("./pages/Content").then(m => ({ default: m.NewComplaintForm })));
const AnnouncementsList = lazy(() => import("./pages/Content").then(m => ({ default: m.AnnouncementsList })));
const AnnouncementDetail = lazy(() => import("./pages/Content").then(m => ({ default: m.AnnouncementDetail })));
const NewAnnouncementForm = lazy(() => import("./pages/Content").then(m => ({ default: m.NewAnnouncementForm })));
const RealEstateList = lazy(() => import("./pages/Content").then(m => ({ default: m.RealEstateList })));
const RealEstateDetail = lazy(() => import("./pages/Content").then(m => ({ default: m.RealEstateDetail })));
const NewRealEstateForm = lazy(() => import("./pages/Content").then(m => ({ default: m.NewRealEstateForm })));
const JobsList = lazy(() => import("./pages/Content").then(m => ({ default: m.JobsList })));
const NewJobForm = lazy(() => import("./pages/Content").then(m => ({ default: m.NewJobForm })));
const QuestionsList = lazy(() => import("./pages/Content").then(m => ({ default: m.QuestionsList })));
const QuestionDetail = lazy(() => import("./pages/Content").then(m => ({ default: m.QuestionDetail })));
const NewQuestionForm = lazy(() => import("./pages/Content").then(m => ({ default: m.NewQuestionForm })));
const DirectoryPage = lazy(() => import("./pages/Directory"));
const MorePage = lazy(() => import("./pages/More"));

const InspectorsPage = lazy(() => import("./pages/Inspectors"));
const HistoryPage = lazy(() => import("./pages/History"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AdminPanel = lazy(() => import("./pages/Admin"));
const Gastronom = lazy(() => import("./pages/Gastronom"));
const Prorab = lazy(() => import("./pages/Prorab"));
const Pharmacy = lazy(() => import("./pages/Pharmacy"));
const Food = lazy(() => import("./pages/Food"));
const FoodRestaurants = lazy(() => import("./pages/FoodDelivery"));
const FoodPark = lazy(() => import("./pages/FoodPark"));
const FoodCourier = lazy(() => import("./pages/FoodCourier"));
const BusinessPage = lazy(() => import("./pages/Business"));
const SupportPage = lazy(() => import("./pages/Support"));
const TransportPage = lazy(() => import("./pages/Transport"));
const TaxiPage = lazy(() => import("./pages/Taxi"));
const TaxiRidePage = lazy(() => import("./pages/TaxiRide"));
const TaxiDriverHub = lazy(() => import("./pages/TaxiDriverHub"));
const AccountAuth = lazy(() => import("./pages/AccountAuth"));
const GoogleAccountCallback = lazy(() => import("./pages/GoogleAccountCallback"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const Cabinet = lazy(() => import("./pages/Cabinet"));
const CabinetMaster = lazy(() => import("./pages/CabinetMaster"));
const CabinetDriver = lazy(() => import("./pages/CabinetDriver"));
const CabinetCourier = lazy(() => import("./pages/CabinetCourier"));
const DeliveryTrack = lazy(() => import("./pages/DeliveryTrack"));
const CabinetPartner = lazy(() => import("./pages/CabinetPartner"));
const CabinetAdmin = lazy(() => import("./pages/CabinetAdmin"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Minimal skeleton loading fallback
function PageLoader() {
  const native = Capacitor.isNativePlatform();
  if (native) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0B0F19] to-[#111827] flex flex-col items-center justify-center gap-3">
        <img src="/icon-192.png" alt="" width={56} height={56} className="rounded-xl opacity-90" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-yellow-400" />
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="h-16 bg-white shadow-sm" />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Protected({ children }: { children: JSX.Element }) {
  const navigate = useNavigate();
  const authed = Boolean(getAccountToken());

  useEffect(() => {
    if (!authed) navigate("/account", { replace: true });
  }, [authed, navigate]);

  if (!authed) return <AuthGateLoader />;
  return children;
}

function App() {
  const [showWelcome, setShowWelcome] = useState(
    () => Capacitor.isNativePlatform() && !sessionStorage.getItem('s24_welcome_done')
  );
  const dismissWelcome = useCallback(() => {
    sessionStorage.setItem('s24_welcome_done', '1');
    setShowWelcome(false);
    document.getElementById('boot-splash')?.remove();
  }, []);

  useEffect(() => {
    if (!getAccountToken()) return;
    void refreshAccountProfile();
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        {showWelcome && <AppWelcomeSplash onHidden={dismissWelcome} />}
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Home — eagerly loaded for instant FCP */}
              <Route path="/" element={<Index />} />

              {/* Masters — lazy */}
              <Route path="/masters" element={<MastersCatalog />} />
              <Route path="/masters/request" element={<RequireUserAuth><MasterRequestForm /></RequireUserAuth>} />
              <Route path="/masters/become" element={<BecomeMasterForm />} />
              <Route path="/masters/:id" element={<MasterDetail />} />

              {/* Content pages — lazy */}
              <Route path="/news" element={<NewsList />} />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="/complaints" element={<ComplaintsList />} />
              <Route path="/complaints/new" element={<RequireUserAuth><NewComplaintForm /></RequireUserAuth>} />
              <Route path="/announcements" element={<AnnouncementsList />} />
              <Route path="/announcements/new" element={<RequireUserAuth><NewAnnouncementForm /></RequireUserAuth>} />
              <Route path="/announcements/:id" element={<AnnouncementDetail />} />
              <Route path="/real-estate" element={<RealEstateList />} />
              <Route path="/real-estate/new" element={<NewRealEstateForm />} />
              <Route path="/real-estate/:id" element={<RealEstateDetail />} />
              <Route path="/jobs" element={<JobsList />} />
              <Route path="/jobs/new" element={<NewJobForm />} />
              <Route path="/questions" element={<QuestionsList />} />
              <Route path="/questions/new" element={<NewQuestionForm />} />
              <Route path="/questions/:id" element={<QuestionDetail />} />
              <Route path="/directory" element={<DirectoryPage />} />
              <Route path="/more" element={<MorePage />} />
              <Route path="/taxi" element={<TaxiPage />} />
              <Route path="/taxi/driver" element={<TaxiDriverHub />} />
              <Route path="/taxi/ride/:id" element={<RequireUserAuth><TaxiRidePage /></RequireUserAuth>} />
              <Route path="/transport" element={<TransportPage />} />
              <Route path="/account" element={<AccountAuth />} />
              <Route path="/cabinet" element={<Protected><Cabinet /></Protected>} />
              <Route path="/cabinet/master" element={<Protected><RequireCabinetRole allowedRoles={["master"]}><CabinetMaster /></RequireCabinetRole></Protected>} />
              <Route path="/cabinet/driver" element={<Protected><RequireCabinetRole allowedRoles={["driver"]}><CabinetDriver /></RequireCabinetRole></Protected>} />
              <Route path="/cabinet/courier" element={<Protected><CabinetCourier /></Protected>} />
              <Route path="/delivery/food/:orderId" element={<DeliveryTrack />} />
              <Route path="/cabinet/partner" element={<Protected><RequireCabinetRole allowedRoles={["seller"]}><CabinetPartner /></RequireCabinetRole></Protected>} />
              <Route path="/cabinet/admin" element={<Protected><RequireCabinetRole allowedRoles={["admin", "superadmin", "moderator"]}><CabinetAdmin /></RequireCabinetRole></Protected>} />

              {/* Other pages — lazy */}
              <Route path="/inspectors" element={<InspectorsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/food" element={<Food />} />
              <Route path="/food/restaurants" element={<FoodRestaurants />} />
              <Route path="/gastronom" element={<Gastronom />} />
              <Route path="/prorab" element={<Prorab />} />
              <Route path="/apteka" element={<Pharmacy />} />
              <Route path="/pharmacy" element={<Navigate to="/apteka" replace />} />
              <Route path="/food/park" element={<FoodPark />} />
              <Route path="/food/courier" element={<FoodCourier />} />
              <Route path="/business" element={<BusinessPage />} />
              <Route path="/support" element={<SupportPage />} />

              {/* Admin panel — accessible via /admin */}
              <Route path="/admin" element={<AdminPanel />} />
              {/* Legacy hidden URL — redirect to /admin */}
              <Route path="/system-portal-924" element={<Navigate to="/admin" replace />} />

              {/* Friendly aliases */}
              <Route path="/ads" element={<Navigate to="/announcements" replace />} />
              <Route path="/register" element={<AccountAuth />} />
              <Route path="/login" element={<AccountAuth />} />
              <Route path="/login/google/callback" element={<GoogleAccountCallback />} />
              <Route path="/legal/:doc" element={<LegalPage />} />

              {/* Block common attack paths — redirect to home */}
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/dashboard/*" element={<Navigate to="/" replace />} />
              <Route path="/panel" element={<Navigate to="/" replace />} />
              <Route path="/panel/*" element={<Navigate to="/" replace />} />
              <Route path="/wp-admin" element={<Navigate to="/" replace />} />
              <Route path="/wp-admin/*" element={<Navigate to="/" replace />} />

              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;