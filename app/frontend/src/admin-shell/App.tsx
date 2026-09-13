import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AdminPanel from '@/pages/Admin';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/admin" replace />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
            <Toaster />
          </BrowserRouter>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
