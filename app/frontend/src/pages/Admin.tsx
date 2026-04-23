import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, Lock, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { client, withRetry } from '@/lib/api';
import { DesktopSidebar, MobileDrawer, MobileHeader, getTabLabel } from '@/components/AdminSidebar';
import AdminNews from './AdminNews';
import AdminComplaints from './AdminComplaints';
import AdminAnnouncements from './AdminAnnouncements';
import AdminRealEstate from './AdminRealEstate';
import AdminJobs from './AdminJobs';
import AdminMasters from './AdminMasters';
import AdminDirectory from './AdminDirectory';
import AdminBanners from './AdminBanners';
import AdminCategories from './AdminCategories';
import AdminFood from './AdminFood';
import AdminFoodOrders from './AdminFoodOrders';
import AdminFoodSettings from './AdminFoodSettings';
import AdminInspectors from './AdminInspectors';
import AdminStats from './AdminStats';
import AdminHistory from './AdminHistory';
import AdminFrontpad from './AdminFrontpad';
import AdminTransport from './AdminTransport';
import AdminParkPoints from './AdminParkPoints';
import AdminParkOrders from './AdminParkOrders';
import AdminAccountSettings from './AdminAccountSettings';

// JWT token key in localStorage (persists across tabs and browser restarts)
const SESSION_KEY = '_sp924_token';

interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  jwt_token?: string;
  remaining_attempts: number;
}

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const resp = await fetch((import.meta.env.VITE_API_BASE_URL || '') + (import.meta.env.VITE_API_BASE_URL||'') + '/api/v1/admin-auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Host': globalThis?.window?.location?.origin ?? '',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const result: LoginResponse = await resp.json();

      if (result.success && result.token) {
        localStorage.setItem(SESSION_KEY, result.token);
        localStorage.setItem('token', result.token);
        onLogin(result.token);
      } else {
        setError(result.message || 'Неверный логин или пароль');
        setRemainingAttempts(result.remaining_attempts);
        if (result.remaining_attempts === 0) {
          setIsLocked(true);
        }
      }
    } catch (err: any) {
      console.error('[Admin Login] Error:', err);
      setError(err?.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center mb-3">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-xl">Авторизация</CardTitle>
          <p className="text-sm text-gray-500 mt-1">Системный портал</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Логин</label>
              <Input
                type="text"
                placeholder="Введите логин"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                autoComplete="username"
                disabled={isLocked}
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="pl-10 pr-10"
                  autoComplete="current-password"
                  disabled={isLocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-700 text-sm">{error}</p>
                  {remainingAttempts !== null && remainingAttempts > 0 && (
                    <p className="text-red-500 text-xs mt-1">
                      Осталось попыток: {remainingAttempts}
                    </p>
                  )}
                </div>
              </div>
            )}

            {isLocked && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-amber-700 text-sm">
                  Аккаунт временно заблокирован. Повторите через 15 минут.
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900"
              disabled={loading || isLocked}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              Войти
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPanel() {
  const [isAuth, setIsAuth] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [verifying, setVerifying] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeTab = searchParams.get('tab') || 'news';

  const verifySession = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) {
      setVerifying(false);
      return;
    }

    try {
      const resp = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/admin-auth/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'App-Host': globalThis?.window?.location?.origin ?? '',
        },
      });
      const result: { valid: boolean; username: string; jwt_token?: string } = await resp.json();
      if (result.valid) {
        setIsAuth(true);
        setSessionToken(token);
        if (result.jwt_token) {
          localStorage.setItem(SESSION_KEY, result.jwt_token);
          localStorage.setItem('token', result.jwt_token);
        }
      } else {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('token');
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('token');
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  const handleLogin = (token: string) => {
    setSessionToken(token);
    setIsAuth(true);
  };

  const handleLogout = async () => {
    try {
      await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/admin-auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
          'App-Host': globalThis?.window?.location?.origin ?? '',
        },
      });
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('admin_auth');
    setIsAuth(false);
    setSessionToken('');
  };

  const setTab = (tab: string) => {
    setSearchParams({ tab });
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Проверка сессии...</p>
        </div>
      </div>
    );
  }

  if (!isAuth) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'stats': return <AdminStats />;
      case 'categories': return <AdminCategories />;
      case 'news': return <AdminNews />;
      case 'complaints': return <AdminComplaints />;
      case 'announcements': return <AdminAnnouncements />;
      case 'real-estate': return <AdminRealEstate />;
      case 'jobs': return <AdminJobs />;
      case 'master-requests': return <AdminMasters section="requests" />;
      case 'become-master': return <AdminMasters section="become" />;
      case 'masters': return <AdminMasters section="catalog" />;
      case 'directory': return <AdminDirectory />;
      case 'inspectors': return <AdminInspectors />;
      case 'banners': return <AdminBanners />;
      case 'history': return <AdminHistory />;
      case 'food': return <AdminFood />;
      case 'food-orders': return <AdminFoodOrders />;
      case 'food-settings': return <AdminFoodSettings />;
      case 'park-points': return <AdminParkPoints />;
      case 'park-orders': return <AdminParkOrders />;
      case 'transport': return <AdminTransport />;
      case 'pos-integration': return <AdminFrontpad />;
      case 'account-settings': return <AdminAccountSettings />;
      default: return <AdminCategories />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <DesktopSidebar
        activeTab={activeTab}
        onTabChange={setTab}
        onLogout={handleLogout}
      />

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeTab={activeTab}
        onTabChange={setTab}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <main className="flex-1 md:ml-60 pb-4 md:pb-0">
        {/* Mobile Header with Burger */}
        <MobileHeader
          activeTab={activeTab}
          onMenuOpen={() => setMobileMenuOpen(true)}
          onLogout={handleLogout}
        />

        {/* Desktop Header */}
        <div className="hidden md:block px-6 py-4 border-b border-gray-200 bg-white">
          <h1 className="text-xl font-bold text-gray-900">{getTabLabel(activeTab)}</h1>
        </div>

        <div className="p-4 md:p-6">
          {renderContent()}
        </div>

        {/* Admin Footer */}
        <div className="bg-white border-t border-gray-100 py-3 text-center">
          <p style={{ color: '#999', fontSize: '11px' }}>Системный портал · SORTIROVKA 24</p>
        </div>
      </main>
    </div>
  );
}
