import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Loader2, Eye, EyeOff, AlertCircle, LogOut, KeyRound, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  clearPartnerToken,
  getPartnerToken,
  partnerChangePassword,
  partnerLogin,
  partnerVerifySession,
  setPartnerToken,
  PARTNER_MODULES,
  type PartnerType,
} from '@/lib/partnerAuthApi';

interface PartnerAdminShellProps {
  partnerType: PartnerType;
  children: ReactNode;
}

function PartnerLoginForm({
  partnerType,
  onLogin,
}: {
  partnerType: PartnerType;
  onLogin: (displayName: string) => void;
}) {
  const cfg = PARTNER_MODULES[partnerType];
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
      const result = await partnerLogin(partnerType, login, password);
      if (result.success && result.token) {
        setPartnerToken(partnerType, result.token);
        onLogin(result.display_name || cfg.defaultDisplayName);
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
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg ${cfg.buttonClass}`}>
            <Store className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">{cfg.label}</CardTitle>
          <p className="text-sm text-gray-500 mt-2">Партнёрская админка — {cfg.description}</p>
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
            <Button type="submit" className={`w-full text-white font-bold ${cfg.buttonClass}`} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Войти в админку'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-400">
            Нет доступа? Обратитесь к оператору Sortirovka24.
          </p>
          <p className="mt-2 text-center">
            <Link to={cfg.storefront} className={`text-xs font-semibold hover:underline ${cfg.accentClass}`}>
              ← Вернуться на витрину {cfg.label}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ChangePasswordDialog({ partnerType, onClose }: { partnerType: PartnerType; onClose: () => void }) {
  const cfg = PARTNER_MODULES[partnerType];
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await partnerChangePassword(partnerType, current, next);
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
        <CardHeader><CardTitle className="text-lg">Сменить пароль</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" placeholder="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input type="password" placeholder="Новый пароль (мин. 6 символов)" value={next} onChange={(e) => setNext(e.target.value)} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
              <Button type="submit" className={`flex-1 text-white ${cfg.buttonClass}`} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PartnerAdminShell({ partnerType, children }: PartnerAdminShellProps) {
  const cfg = PARTNER_MODULES[partnerType];
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const verifySession = useCallback(async () => {
    const token = getPartnerToken(partnerType);
    if (!token) {
      setAuthenticated(false);
      setChecking(false);
      return;
    }
    try {
      const session = await partnerVerifySession(partnerType);
      if (session.valid) {
        setAuthenticated(true);
        setDisplayName(session.display_name || cfg.defaultDisplayName);
      } else {
        clearPartnerToken(partnerType);
        setAuthenticated(false);
      }
    } catch {
      clearPartnerToken(partnerType);
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }, [partnerType, cfg.defaultDisplayName]);

  useEffect(() => { verifySession(); }, [verifySession]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className={`h-8 w-8 animate-spin ${cfg.accentClass}`} />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <PartnerLoginForm
        partnerType={partnerType}
        onLogin={(name) => { setAuthenticated(true); setDisplayName(name); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-widest ${cfg.accentClass}`}>Партнёрская админка</p>
            <p className="font-bold text-gray-900">{displayName || cfg.label}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)} className="gap-1.5">
              <KeyRound className="h-4 w-4" /> Пароль
            </Button>
            <Button variant="outline" size="sm" onClick={() => { clearPartnerToken(partnerType); setAuthenticated(false); }} className="gap-1.5">
              <LogOut className="h-4 w-4" /> Выйти
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {showPasswordDialog && (
        <ChangePasswordDialog partnerType={partnerType} onClose={() => setShowPasswordDialog(false)} />
      )}
    </div>
  );
}
