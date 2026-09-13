import { useLanguage } from '@/contexts/LanguageContext';
import { useState } from 'react';
import { Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle, KeyRound, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { apiUrl } from '@/lib/config';

const SESSION_KEY = '_sp924_token';

interface ChangeResult {
  success: boolean;
  message: string;
}

function getAdminToken(): string {
  try {
    return localStorage.getItem(SESSION_KEY) || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

async function callApi<T = any>(url: string, method: string = 'GET', data?: any, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host': globalThis?.window?.location?.origin ?? '',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(apiUrl(url), {
    method,
    headers,
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return (await res.json()) as T;
}

export default function AdminAccountSettings() {
  const { t: adminT } = useLanguage();

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
      setResult({ success: false, message: adminT("admin.ui.0019") });
      return;
    }

    if (!newUsername.trim() && !newPassword.trim()) {
      setResult({ success: false, message: adminT("admin.ui.0020") });
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setResult({ success: false, message: adminT("admin.ui.0021") });
      return;
    }

    if (newPassword && newPassword.length < 8) {
      setResult({ success: false, message: adminT("admin.ui.0022") });
      return;
    }

    if (newUsername && newUsername.trim().length < 3) {
      setResult({ success: false, message: adminT("admin.ui.0023") });
      return;
    }

    setLoading(true);

    try {
      const token = getAdminToken();
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
      setResult({ success: false, message: err?.message || adminT("admin.ui.0024") });
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
            {adminT("admin.ui.0025")} </CardTitle>
          <CardDescription>
            {adminT("admin.ui.0026")} </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Current Password (required for confirmation) */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                {adminT("admin.ui.0027")} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder={adminT("admin.ui.0028")}
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
              <p className="text-xs text-gray-500 mt-1">{adminT("admin.ui.0029")}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-medium text-gray-600 mb-3">{adminT("admin.ui.0030")}</p>
            </div>

            {/* New Username */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                <User className="inline h-3.5 w-3.5 mr-1" />
                {adminT("admin.ui.0031")} </label>
              <Input
                type="text"
                placeholder={adminT("admin.ui.0032")}
                value={newUsername}
                onChange={(e) => { setNewUsername(e.target.value); setResult(null); }}
                autoComplete="username"
              />
            </div>

            {/* New Password */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                <KeyRound className="inline h-3.5 w-3.5 mr-1" />
                {adminT("admin.ui.0033")} </label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder={adminT("admin.ui.0034")}
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
                  {adminT("admin.ui.0035")} </label>
                <Input
                  type="password"
                  placeholder={adminT("admin.ui.0036")}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setResult(null); }}
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">{adminT("admin.ui.0037")}</p>
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
              className="w-full bg-slate-800 hover:bg-slate-900 text-white"
              disabled={loading || !currentPassword.trim()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {adminT("admin.ui.0038")} </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}