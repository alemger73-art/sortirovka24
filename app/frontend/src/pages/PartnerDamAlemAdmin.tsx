import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Loader2, Eye, EyeOff, AlertCircle, LogOut, KeyRound, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AdminDamAlem from './AdminDamAlem';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import {
  clearPartnerToken,
  getPartnerToken,
  partnerDamAlemChangePassword,
  partnerDamAlemLogin,
  partnerDamAlemVerifySession,
  setPartnerToken,
} from '@/lib/partnerAuthApi';
import { toast } from 'sonner';

function PartnerLogin({ onLogin }: { onLogin: (displayName: string) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setError('Введите email или телефон и пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await partnerDamAlemLogin(login, password);
      if (result.success && result.token) {
        setPartnerToken(result.token);
        onLogin(result.display_name || DAM_ALEM_BRAND);
      } else {
        setError(result.message || 'Неверный email/телефон или пароль');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F19] via-[#141B2D] to-[#060912] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF3B30] to-[#9f1e18] shadow-lg">
            <UtensilsCrossed className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">{DAM_ALEM_BRAND}</CardTitle>
          <p className="text-sm text-gray-500 mt-2">Партнёрская админка — управление меню, заказами и настройками</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email или телефон</label>
              <Input
                type="text"
                placeholder="+7 777 123 45 67 или partner@mail.kz"
                value={login}
                onChange={(e) => { setLogin(e.target.value); setError(''); }}
                autoComplete="username"
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
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#FF3B30] hover:bg-[#e8352b] text-white font-bold"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Войти в админку'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Нет доступа? Обратитесь к оператору Sortirovka24 — мы выдадим логин и пароль.
          </p>
          <p className="mt-2 text-center">
            <Link to="/food" className="text-xs font-semibold text-[#FF3B30] hover:underline">
              ← Вернуться на витрину {DAM_ALEM_BRAND}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await partnerDamAlemChangePassword(current, next);
      if (result.success) {
        toast.success(result.message);
        onClose();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Сменить пароль</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" placeholder="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input type="password" placeholder="Новый пароль (мин. 6 символов)" value={next} onChange={(e) => setNext(e.target.value)} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
              <Button type="submit" className="flex-1 bg-[#FF3B30] hover:bg-[#e8352b]" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PartnerDamAlemAdmin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const verifySession = useCallback(async () => {
    const token = getPartnerToken();
    if (!token) {
      setAuthenticated(false);
      setChecking(false);
      return;
    }
    try {
      const session = await partnerDamAlemVerifySession();
      if (session.valid) {
        setAuthenticated(true);
        setDisplayName(session.display_name || DAM_ALEM_BRAND);
      } else {
        clearPartnerToken();
        setAuthenticated(false);
      }
    } catch {
      clearPartnerToken();
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  const handleLogout = () => {
    clearPartnerToken();
    setAuthenticated(false);
    setDisplayName('');
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF3B30]" />
      </div>
    );
  }

  if (!authenticated) {
    return <PartnerLogin onLogin={(name) => { setAuthenticated(true); setDisplayName(name); }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#FF3B30]">Партнёрская админка</p>
            <p className="font-bold text-gray-900">{displayName || DAM_ALEM_BRAND}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)} className="gap-1.5">
              <KeyRound className="h-4 w-4" /> Пароль
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" /> Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <AdminDamAlem partnerMode />
      </main>

      {showPasswordDialog && <ChangePasswordDialog onClose={() => setShowPasswordDialog(false)} />}
    </div>
  );
}
