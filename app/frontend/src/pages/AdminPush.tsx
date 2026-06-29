import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pushApiClient, type PushStats } from '@/lib/pushApi';
import { Bell, Loader2, RefreshCw, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

const PATH_PRESETS = [
  { value: '/', label: 'Главная' },
  { value: '/food', label: 'DAM ALEM' },
  { value: '/gastronom', label: 'Гастроном' },
  { value: '/taxi', label: 'Такси' },
  { value: '/content', label: 'Объявления' },
  { value: '/masters', label: 'Мастера' },
  { value: '/transport', label: 'Транспорт' },
];

export default function AdminPush() {
  const [stats, setStats] = useState<PushStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState('Sortirovka24');
  const [body, setBody] = useState('');
  const [path, setPath] = useState('/');
  const [platform, setPlatform] = useState<'all' | 'android' | 'ios'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pushApiClient.adminStats();
      setStats(data);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка загрузки статистики push'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!body.trim()) {
      toast.error('Введите текст уведомления');
      return;
    }
    setSending(true);
    try {
      const result = await pushApiClient.adminBroadcast({
        title: title.trim() || 'Sortirovka24',
        body: body.trim(),
        path: path || '/',
        ...(platform !== 'all' ? { platform } : {}),
      });
      if (result.skipped) {
        toast.error('FCM не настроен на сервере — добавьте FCM_SERVER_KEY в Railway');
      } else if (result.total === 0) {
        toast.warning('Нет зарегистрированных устройств');
      } else if (result.sent > 0) {
        toast.success(`Отправлено: ${result.sent} из ${result.total}`);
        setBody('');
      } else {
        toast.error(`Не доставлено (${result.failed} ошибок)`);
      }
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка отправки'));
    } finally {
      setSending(false);
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const fcmOn = stats?.enabled ?? false;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">Push-уведомления</h2>
            </div>
            <p className="text-sm text-gray-500">
              Исходящая рассылка жителям с установленным приложением. При публикации новости push уходит автоматически.
            </p>
            <p className="text-xs text-amber-600 mt-1.5">
              Входящие алерты: «Центр управления» (toast), Telegram-бот и push на admin APK.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant={fcmOn ? 'default' : 'destructive'}>
            FCM на сервере: {fcmOn ? 'включён' : 'выключен'}
          </Badge>
          <Badge variant="secondary">
            <Smartphone className="w-3 h-3 mr-1 inline" />
            Жители: {stats?.active_devices ?? 0} активных
          </Badge>
          <Badge variant="secondary">
            Админ APK: {stats?.admin_active ?? 0}
          </Badge>
          <Badge variant="outline">Android: {stats?.android_active ?? 0}</Badge>
          <Badge variant="outline">iOS: {stats?.ios_active ?? 0}</Badge>
        </div>

        {!fcmOn && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
            <p className="font-medium">Чтобы push заработал:</p>
            <ol className="list-decimal list-inside space-y-1 text-amber-800">
              <li>Firebase Console → проект → Cloud Messaging → Server key (legacy)</li>
              <li>Railway → Variables → <code className="bg-amber-100 px-1 rounded">FCM_SERVER_KEY</code></li>
              <li>Скачать <code className="bg-amber-100 px-1 rounded">google-services.json</code> → <code className="bg-amber-100 px-1 rounded">android/app/</code></li>
              <li>В <code className="bg-amber-100 px-1 rounded">.env.mobile</code>: <code className="bg-amber-100 px-1 rounded">VITE_ENABLE_NATIVE_PUSH=true</code></li>
              <li>Пересобрать APK и установить на телефон</li>
            </ol>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Ручная рассылка</h3>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Заголовок</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Текст *</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Текст уведомления для жителей..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Экран при нажатии</label>
            <Select value={path} onValueChange={setPath}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PATH_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Платформа</label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="android">Только Android</SelectItem>
                <SelectItem value="ios">Только iOS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Отправить push
        </Button>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800 mb-1">Автоматические push</p>
        <p>
          При публикации новости в разделе «Новости» (галочка «Опубликовано») всем устройствам уходит
          уведомление с переходом на страницу этой новости.
        </p>
      </div>
    </div>
  );
}
