import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

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
const DirectoryPage = lazy(() => import("./pages/Content").then(m => ({ default: m.DirectoryPage })));

const InspectorsPage = lazy(() => import("./pages/Inspectors"));
const HistoryPage = lazy(() => import("./pages/History"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AdminPanel = lazy(() => import("./pages/Admin"));
const Food = lazy(() => import("./pages/Food"));
const FoodPark = lazy(() => import("./pages/FoodPark"));
const FoodCourier = lazy(() => import("./pages/FoodCourier"));
const BusinessPage = lazy(() => import("./pages/Business"));
const TransportPage = lazy(() => import("./pages/Transport"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Minimal skeleton loading fallback
function PageLoader() {
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

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Home — eagerly loaded for instant FCP */}
              <Route path="/" element={<Index />} />

              {/* Masters — lazy */}
              <Route path="/masters" element={<MastersCatalog />} />
              <Route path="/masters/request" element={<MasterRequestForm />} />
              <Route path="/masters/become" element={<BecomeMasterForm />} />
              <Route path="/masters/:id" element={<MasterDetail />} />

              {/* Content pages — lazy */}
              <Route path="/news" element={<NewsList />} />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="/complaints" element={<ComplaintsList />} />
              <Route path="/complaints/new" element={<NewComplaintForm />} />
              <Route path="/announcements" element={<AnnouncementsList />} />
              <Route path="/announcements/new" element={<NewAnnouncementForm />} />
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
              <Route path="/transport" element={<TransportPage />} />

              {/* Other pages — lazy */}
              <Route path="/inspectors" element={<InspectorsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/food" element={<Food />} />
              <Route path="/food/park" element={<FoodPark />} />
              <Route path="/food/courier" element={<FoodCourier />} />
              <Route path="/business" element={<BusinessPage />} />

              {/* Admin panel — accessible via /admin */}
              <Route path="/admin" element={<AdminPanel />} />
              {/* Legacy hidden URL — redirect to /admin */}
              <Route path="/system-portal-924" element={<Navigate to="/admin" replace />} />

              {/* Block common attack paths — redirect to home */}
              <Route path="/login" element={<Navigate to="/" replace />} />
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
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;