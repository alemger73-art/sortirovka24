import { useState } from 'react';
import { Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle, KeyRound, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { client } from '@/lib/api';

const SESSION_KEY = '_sp924_token';

interface ChangeResult {
  success: boolean;
  message: string;
}

async function callApi<T = any>(url: string, method: string = 'GET', data?: any, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await client.apiCall.invoke<T>({
    url,
    method,
    ...(data ? { data } : {}),
    headers,
  });
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as any).data as T;
  }
  return res as T;
}

export default function AdminAccountSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChangeResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    if (!currentPassword.trim()) {
      setResult({ success: false, message: 'Введите текущий пароль для подтверждения.' });
      return;
    }

    if (!newUsername.trim() && !newPassword.trim()) {
      setResult({ success: false, message: 'Введите новый логин или новый пароль.' });
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setResult({ success: false, message: 'Новый пароль и подтверждение не совпадают.' });
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setResult({ success: false, message: 'Новый пароль должен содержать минимум 8 символов.' });
      return;
    }

    if (newUsername && newUsername.trim().length < 3) {
      setResult({ success: false, message: 'Логин должен содержать минимум 3 символа.' });
      return;
    }

    setLoading(true);

    try {
      const token = sessionStorage.getItem(SESSION_KEY) || '';
      const res = await callApi<ChangeResult>('/api/v1/admin-auth/change-credentials', 'POST', {
        current_password: currentPassword,
        ...(newUsername.trim() ? { new_username: newUsername.trim() } : {}),
        ...(newPassword ? { new_password: newPassword } : {}),
      }, token);

      setResult(res);

      if (res.success) {
        // Clear form on success
        setCurrentPassword('');
        setNewUsername('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setResult({ success: false, message: err?.message || 'Ошибка подключения к серверу.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Настройки аккаунта
          </CardTitle>
          <CardDescription>
            Смените логин и/или пароль для входа в панель управления
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Current Password (required for confirmation) */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Текущий пароль <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Введите текущий пароль"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setResult(null); }}
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Обязательно для подтверждения изменений</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-medium text-gray-600 mb-3">Новые данные (заполните одно или оба поля)</p>
            </div>

            {/* New Username */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                <User className="inline h-3.5 w-3.5 mr-1" />
                Новый логин
              </label>
              <Input
                type="text"
                placeholder="Введите новый логин (мин. 3 символа)"
                value={newUsername}
                onChange={(e) => { setNewUsername(e.target.value); setResult(null); }}
                autoComplete="username"
              />
            </div>

            {/* New Password */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                <KeyRound className="inline h-3.5 w-3.5 mr-1" />
                Новый пароль
              </label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Введите новый пароль (мин. 8 символов)"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setResult(null); }}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            {newPassword && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Подтвердите новый пароль
                </label>
                <Input
                  type="password"
                  placeholder="Повторите новый пароль"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setResult(null); }}
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Пароли не совпадают</p>
                )}
              </div>
            )}

            {/* Result message */}
            {result && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border ${
                result.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                {result.success ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                  {result.message}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900"
              disabled={loading || !currentPassword.trim()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Сохранить изменения
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}