import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  Zap,
  History,
  Package,
  FolderTree,
  Puzzle,
  BarChart3,
  Bug,
  ShoppingCart,
  UtensilsCrossed,
  ChevronDown,
  ChevronUp,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';

interface FrontpadSettings {
  menu_secret: string;
  order_secret: string;
  affiliate_id: string;
  delivery_product_id: string;
  sync_interval: string;
  last_sync_status: string;
  last_sync_at: string;
  last_sync_error: string;
  api_key: string; // legacy
}

interface SyncLogEntry {
  id: number;
  sync_type: string;
  status: string;
  products_synced: number | null;
  categories_synced: number | null;
  modifiers_synced?: number | null;
  errors: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface SyncResult {
  success: boolean;
  message: string;
  categories_received: number;
  categories_synced: number;
  products_received: number;
  products_synced: number;
  products_displayed: number;
  modifiers_received: number;
  modifiers_synced: number;
  errors: string[];
}

interface DebugApiResponse {
  success: boolean;
  message: string;
  http_status: number;
  response_keys: string[];
  products_count: number;
  categories_found: string[];
  modifiers_count: number;
  sample_product: Record<string, any> | null;
  raw_response_truncated: string;
}

/** Helper to call custom backend endpoints via the SDK's apiCall.invoke method. */
async function callApi<T = any>(url: string, method: string = 'GET', data?: any): Promise<T> {
  const res = await client.apiCall.invoke<T>({
    url,
    method,
    ...(data ? { data } : {}),
  });
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as any).data as T;
  }
  return res as T;
}

export default function AdminFrontpad() {
  const [settings, setSettings] = useState<FrontpadSettings>({
    menu_secret: '',
    order_secret: '',
    affiliate_id: '',
    delivery_product_id: '',
    sync_interval: 'manual',
    last_sync_status: '',
    last_sync_at: '',
    last_sync_error: '',
    api_key: '',
  });
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [debugging, setDebugging] = useState(false);
  const [showMenuSecret, setShowMenuSecret] = useState(false);
  const [showOrderSecret, setShowOrderSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [debugResult, setDebugResult] = useState<DebugApiResponse | null>(null);
  const [showDebugRaw, setShowDebugRaw] = useState(false);
  const [showOrderSettings, setShowOrderSettings] = useState(false);

  // Form state (editable)
  const [formMenuSecret, setFormMenuSecret] = useState('');
  const [formOrderSecret, setFormOrderSecret] = useState('');
  const [formAffiliate, setFormAffiliate] = useState('');
  const [formDeliveryProductId, setFormDeliveryProductId] = useState('');
  const [formInterval, setFormInterval] = useState('manual');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await callApi<FrontpadSettings>('/api/v1/frontpad/settings');
      setSettings(data);
      setFormMenuSecret(data.menu_secret || data.api_key || '');
      setFormOrderSecret(data.order_secret || data.api_key || '');
      setFormAffiliate(data.affiliate_id);
      setFormDeliveryProductId(data.delivery_product_id || '');
      setFormInterval(data.sync_interval || 'manual');
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSyncLog = useCallback(async () => {
    try {
      const data = await callApi<SyncLogEntry[]>('/api/v1/frontpad/sync-log');
      setSyncLog(data);
    } catch (err) {
      console.error('Failed to load sync log:', err);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadSyncLog();
  }, [loadSettings, loadSyncLog]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await callApi<FrontpadSettings>('/api/v1/frontpad/settings', 'PUT', {
        menu_secret: formMenuSecret,
        order_secret: formOrderSecret,
        affiliate_id: formAffiliate,
        delivery_product_id: formDeliveryProductId,
        sync_interval: formInterval,
      });
      setSettings(data);
      toast.success('Настройки сохранены');
      invalidateAllCaches();
    } catch (err: any) {
      toast.error(`Ошибка сохранения: ${err?.message || 'Неизвестная ошибка'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save menu_secret first if changed
      if (formMenuSecret !== settings.menu_secret) {
        await callApi('/api/v1/frontpad/settings', 'PUT', { menu_secret: formMenuSecret });
      }
      const result = await callApi<{ success: boolean; message: string }>('/api/v1/frontpad/test-connection', 'POST');
      setTestResult(result);
      if (result.success) {
        toast.success(result.message);
        invalidateAllCaches();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      const msg = err?.message || 'Неизвестная ошибка';
      setTestResult({ success: false, message: msg });
      toast.error(`Ошибка: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await callApi<SyncResult>('/api/v1/frontpad/sync', 'POST');
      setLastSyncResult(result);
      if (result.success) {
        toast.success(result.message);
        invalidateAllCaches();
      } else {
        toast.error(result.message);
      }
      await loadSettings();
      await loadSyncLog();
    } catch (err: any) {
      toast.error(`Ошибка синхронизации: ${err?.message || 'Неизвестная ошибка'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDebugApi = async () => {
    setDebugging(true);
    setDebugResult(null);
    try {
      // Save menu_secret first if changed
      if (formMenuSecret !== settings.menu_secret) {
        await callApi('/api/v1/frontpad/settings', 'PUT', { menu_secret: formMenuSecret });
      }
      const result = await callApi<DebugApiResponse>('/api/v1/frontpad/debug-api', 'POST');
      setDebugResult(result);
      if (result.success) {
        toast.success(`API ответил: ${result.products_count} товаров`);
        invalidateAllCaches();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(`Ошибка отладки: ${err?.message || 'Неизвестная ошибка'}`);
    } finally {
      setDebugging(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-700 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Успешно</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300"><AlertTriangle className="w-3 h-3 mr-1" />Частично</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300"><AlertTriangle className="w-3 h-3 mr-1" />Предупреждение</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700 border-red-300"><XCircle className="w-3 h-3 mr-1" />Ошибка</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-300"><Loader2 className="w-3 h-3 mr-1 animate-spin" />В процессе</Badge>;
      default:
        return <Badge variant="outline">{status || 'Нет данных'}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Connection Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-amber-500" />
              Статус подключения
            </CardTitle>
            {settings.last_sync_status && statusBadge(settings.last_sync_status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Последняя синхронизация</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {formatDate(settings.last_sync_at)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Статус</p>
              <p className="text-sm font-medium">
                {settings.last_sync_status === 'success' && '✅ Успешно'}
                {settings.last_sync_status === 'partial' && '⚠️ Частично'}
                {settings.last_sync_status === 'warning' && '⚠️ Предупреждение'}
                {settings.last_sync_status === 'failed' && '❌ Ошибка'}
                {settings.last_sync_status === 'in_progress' && '⏳ В процессе'}
                {!settings.last_sync_status && '⚪ Не выполнялась'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Интервал</p>
              <p className="text-sm font-medium">
                {formInterval === 'manual' && '🔧 Вручную'}
                {formInterval === '1h' && '⏱️ Каждый час'}
                {formInterval === '24h' && '📅 Каждые 24 часа'}
              </p>
            </div>
          </div>
          {settings.last_sync_error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {settings.last_sync_error}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Results Card (shown after sync) */}
      {lastSyncResult && (
        <Card className={lastSyncResult.success ? 'border-green-200' : 'border-red-200'}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              Результаты синхронизации
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <FolderTree className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                <p className="text-2xl font-bold text-blue-700">{lastSyncResult.categories_received}</p>
                <p className="text-xs text-blue-600">Категорий получено</p>
                {lastSyncResult.categories_synced > 0 && (
                  <p className="text-xs text-green-600 mt-1">+{lastSyncResult.categories_synced} новых</p>
                )}
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <Package className="w-5 h-5 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold text-green-700">{lastSyncResult.products_synced}</p>
                <p className="text-xs text-green-600">Товаров синхр.</p>
                <p className="text-xs text-gray-500 mt-1">из {lastSyncResult.products_received} полученных</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <Eye className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                <p className="text-2xl font-bold text-amber-700">{lastSyncResult.products_displayed}</p>
                <p className="text-xs text-amber-600">Отображается</p>
                <p className="text-xs text-gray-500 mt-1">активных товаров</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <Puzzle className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                <p className="text-2xl font-bold text-purple-700">{lastSyncResult.modifiers_synced}</p>
                <p className="text-xs text-purple-600">Модификаторов</p>
                <p className="text-xs text-gray-500 mt-1">из {lastSyncResult.modifiers_received} полученных</p>
              </div>
            </div>

            <p className={`text-sm font-medium ${lastSyncResult.success ? 'text-green-700' : 'text-red-700'}`}>
              {lastSyncResult.success ? '✅' : '❌'} {lastSyncResult.message}
            </p>

            {lastSyncResult.errors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-medium text-red-700 mb-1">Ошибки ({lastSyncResult.errors.length}):</p>
                <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside">
                  {lastSyncResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {lastSyncResult.errors.length > 5 && (
                    <li>...и ещё {lastSyncResult.errors.length - 5}</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug API Results Card */}
      {debugResult && (
        <Card className={debugResult.success ? 'border-blue-200' : 'border-red-200'}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bug className="w-5 h-5 text-orange-500" />
              Отладка API — Результат
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={`text-sm font-medium ${debugResult.success ? 'text-green-700' : 'text-red-700'}`}>
              {debugResult.success ? '✅' : '❌'} {debugResult.message}
            </p>

            {debugResult.response_keys.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Ключи ответа API:</p>
                <div className="flex flex-wrap gap-1.5">
                  {debugResult.response_keys.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs font-mono">{key}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{debugResult.products_count}</p>
                <p className="text-xs text-green-600">Товаров</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{debugResult.categories_found.length}</p>
                <p className="text-xs text-blue-600">Категорий</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{debugResult.modifiers_count}</p>
                <p className="text-xs text-purple-600">Модификаторов</p>
              </div>
            </div>

            {debugResult.categories_found.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Найденные категории:</p>
                <div className="flex flex-wrap gap-1.5">
                  {debugResult.categories_found.map((cat) => (
                    <Badge key={cat} className="bg-blue-100 text-blue-700 border-blue-300 text-xs">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}

            {debugResult.sample_product && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Пример товара (первый):</p>
                <pre className="text-xs bg-gray-100 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
                  {JSON.stringify(debugResult.sample_product, null, 2)}
                </pre>
              </div>
            )}

            {debugResult.raw_response_truncated && (
              <div>
                <button
                  onClick={() => setShowDebugRaw(!showDebugRaw)}
                  className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1 hover:text-gray-700"
                >
                  {showDebugRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Сырой ответ API (до 3000 символов)
                </button>
                {showDebugRaw && (
                  <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                    {debugResult.raw_response_truncated}
                  </pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Menu Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UtensilsCrossed className="w-5 h-5 text-green-500" />
            Настройки меню (get_products)
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Этот ключ используется ТОЛЬКО для загрузки товаров, категорий и модификаторов
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Menu Secret */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Секрет для меню (get_products)
            </label>
            <div className="relative">
              <Input
                type={showMenuSecret ? 'text' : 'password'}
                value={formMenuSecret}
                onChange={(e) => setFormMenuSecret(e.target.value)}
                placeholder="Секретный ключ для загрузки меню"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowMenuSecret(!showMenuSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showMenuSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Получите в настройках FrontPad → Общие → API → Секретный код
            </p>
          </div>

          {/* Sync Interval */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Интервал синхронизации
            </label>
            <Select value={formInterval} onValueChange={setFormInterval}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите интервал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Вручную</SelectItem>
                <SelectItem value="1h">Каждый час</SelectItem>
                <SelectItem value="24h">Каждые 24 часа</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Menu Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={handleTestConnection}
              disabled={testing || !formMenuSecret}
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : testResult?.success ? (
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
              ) : testResult?.success === false ? (
                <WifiOff className="w-4 h-4 mr-2 text-red-500" />
              ) : (
                <Wifi className="w-4 h-4 mr-2" />
              )}
              Тест подключения
            </Button>
            <Button
              onClick={handleSync}
              disabled={syncing || !formMenuSecret}
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Синхронизировать меню
            </Button>
            <Button
              onClick={handleDebugApi}
              disabled={debugging || !formMenuSecret}
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              {debugging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bug className="w-4 h-4 mr-2" />}
              Отладка API
            </Button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-sm flex items-center gap-2 ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Settings Card (collapsible) */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowOrderSettings(!showOrderSettings)}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShoppingCart className="w-5 h-5 text-blue-500" />
              Настройки заказов (new_order)
            </CardTitle>
            {showOrderSettings ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Эти настройки используются ТОЛЬКО для отправки заказов в FrontPad
          </p>
        </CardHeader>
        {showOrderSettings && (
          <CardContent className="space-y-4">
            {/* Order Secret */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Секрет для заказов (new_order)
              </label>
              <div className="relative">
                <Input
                  type={showOrderSecret ? 'text' : 'password'}
                  value={formOrderSecret}
                  onChange={(e) => setFormOrderSecret(e.target.value)}
                  placeholder="Секретный ключ для отправки заказов"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOrderSecret(!showOrderSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOrderSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Может совпадать с ключом для меню, если используется один и тот же аккаунт
              </p>
            </div>

            {/* Affiliate ID */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Affiliate ID (ID партнёра)
              </label>
              <Input
                value={formAffiliate}
                onChange={(e) => setFormAffiliate(e.target.value)}
                placeholder="ID партнёра / филиала (если есть)"
              />
              <p className="text-xs text-gray-400 mt-1">
                Используется при отправке заказа для идентификации источника
              </p>
            </div>

            {/* Delivery Product ID */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                <Truck className="w-4 h-4 inline mr-1" />
                ID товара доставки
              </label>
              <Input
                value={formDeliveryProductId}
                onChange={(e) => setFormDeliveryProductId(e.target.value)}
                placeholder="Артикул товара 'Доставка' в FrontPad"
              />
              <p className="text-xs text-gray-400 mt-1">
                Автоматически добавляется к заказу как отдельная позиция
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button (separate for visibility) */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 px-8">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить все настройки
        </Button>
      </div>

      {/* Sync Log Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="w-5 h-5 text-purple-500" />
              Журнал синхронизаций
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadSyncLog}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {syncLog.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Синхронизации ещё не выполнялись</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Дата</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Тип</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Статус</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">
                      <Package className="w-3.5 h-3.5 inline mr-1" />Товары
                    </th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">
                      <FolderTree className="w-3.5 h-3.5 inline mr-1" />Категории
                    </th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Ошибки</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLog.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-600">{formatDate(entry.started_at)}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs">
                          {entry.sync_type === 'manual' ? 'Ручная' : entry.sync_type === 'auto' ? 'Авто' : entry.sync_type}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">{statusBadge(entry.status)}</td>
                      <td className="py-2 px-3 text-gray-700">{entry.products_synced ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-700">{entry.categories_synced ?? '—'}</td>
                      <td className="py-2 px-3">
                        {entry.errors ? (
                          <span className="text-red-600 text-xs truncate max-w-[200px] block" title={entry.errors}>
                            {entry.errors.length > 50 ? entry.errors.slice(0, 50) + '...' : entry.errors}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Как это работает
          </h4>
          <ul className="text-sm text-blue-800 space-y-1.5 list-disc list-inside">
            <li><strong>Меню и заказы — разные ключи!</strong> Ключ для меню используется для get_products, ключ для заказов — для new_order</li>
            <li>Если ключ один и тот же — укажите его в обоих полях</li>
            <li>Нажмите «Тест подключения» для проверки ключа меню и подсчёта товаров</li>
            <li>Нажмите «Отладка API» чтобы увидеть сырой ответ FrontPad и понять структуру данных</li>
            <li>Нажмите «Синхронизировать меню» для загрузки товаров, категорий и модификаторов</li>
            <li><strong>Важно:</strong> В FrontPad каждому товару для интернет-магазина нужно присвоить уникальный цифровой артикул</li>
            <li>Товары без категории попадают в «Прочее»</li>
            <li>Фотографии, загруженные вручную, НЕ перезаписываются (Photo Lock)</li>
            <li>Товары, отсутствующие в FrontPad, автоматически деактивируются</li>
            <li><strong>ID товара доставки</strong> — автоматически добавляется к каждому заказу</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}