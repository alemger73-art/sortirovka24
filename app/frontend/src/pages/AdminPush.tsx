import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pushApiClient, type PushStats } from '@/lib/pushApi';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import { Bell, Loader2, RefreshCw, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

function getPATH_PRESETS(adminT: (key: string) => string) {
  const PATH_PRESETS = [
  { value: '/', label: adminT("admin.ui.0187") },
  { value: '/food', label: DAM_ALEM_BRAND },
  { value: '/gastronom', label: adminT("admin.ui.1036") },
  { value: '/taxi', label: adminT("admin.ui.1037") },
  { value: '/content', label: adminT("admin.ui.0141") },
  { value: '/masters', label: adminT("admin.ui.1038") },
  { value: '/transport', label: adminT("admin.ui.0778") },
];
  return PATH_PRESETS;
}

export default function AdminPush() {
  const { t: adminT } = useLanguage();
  const PATH_PRESETS = getPATH_PRESETS(adminT);

  const [stats, setStats] = useState<PushStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState('Sortirovka24');
  const [body, setBody] = useState('');
  const [path, setPath] = useState('/');
  const [platform, setPlatform] = useState<'all' | 'android' | 'ios'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await pushApiClient.adminStats();
      setStats(data);
    } catch (e: unknown) {
      setLoadError(true);
      toast.error(String((e as Error)?.message || adminT("admin.ui.1039")));
    } finally {
      setLoading(false);
    }
  }, [adminT]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!body.trim()) {
      toast.error(adminT("admin.ui.1040"));
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
        toast.error(adminT("admin.ui.1041"));
      } else if (result.total === 0) {
        toast.warning(adminT("admin.ui.1042"));
      } else if (result.sent > 0) {
        toast.success(adminT("admin.extra.1297").replace('{0}', () => String(result.sent)).replace('{1}', () => String(result.total)));
        setBody('');
      } else {
        toast.error(adminT("admin.extra.1298").replace('{0}', () => String(result.failed)));
      }
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || adminT("admin.ui.1043")));
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

  if (loadError) return <div role="alert" className="rounded-xl border bg-white p-5 space-y-3"><p>{adminT("admin.ui.1044")}</p><Button onClick={load}>{adminT("admin.ui.0285")}</Button></div>;

  const fcmOn = stats?.enabled ?? false;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">{adminT("admin.ui.1045")}</h2>
            </div>
            <p className="text-sm text-gray-500">
              {adminT("admin.ui.1046")} </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {adminT("admin.ui.0408")} </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant={fcmOn ? 'default' : 'destructive'}>
            {fcmOn ? adminT("admin.ui.1047") : adminT("admin.ui.1048")}
          </Badge>
          <Badge variant="secondary">
            <Smartphone className="w-3 h-3 mr-1 inline" />
            {adminT("admin.ui.1049")} {stats?.active_devices ?? 0} {adminT("admin.ui.1050")} </Badge>
          <Badge variant="secondary">
            {adminT("admin.ui.1051")} {stats?.admin_active ?? 0}
          </Badge>
          <Badge variant="outline">Android: {stats?.android_active ?? 0}</Badge>
          <Badge variant="outline">iOS: {stats?.ios_active ?? 0}</Badge>
        </div>

        {!fcmOn && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
            <p>{adminT("admin.ui.1052")}</p>
            <details><summary className="cursor-pointer font-medium">{adminT("admin.ui.1053")}</summary>
            <ol className="list-decimal list-inside space-y-1 text-amber-800">
              <li>{adminT("admin.ui.1054")}</li>
              <li>Railway → Variables → <code className="bg-amber-100 px-1 rounded">FCM_SERVER_KEY</code></li>
              <li>{adminT("admin.ui.1055")} <code className="bg-amber-100 px-1 rounded">google-services.json</code> → <code className="bg-amber-100 px-1 rounded">android/app/</code></li>
              <li>{adminT("admin.ui.1056")} <code className="bg-amber-100 px-1 rounded">.env.mobile</code>: <code className="bg-amber-100 px-1 rounded">VITE_ENABLE_NATIVE_PUSH=true</code></li>
              <li>{adminT("admin.ui.1057")}</li>
            </ol></details>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">{adminT("admin.ui.1058")}</h3>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">{adminT("admin.ui.0302")}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">{adminT("admin.ui.1059")}</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={adminT("admin.ui.1060")}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{adminT("admin.ui.1061")}</label>
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
            <label className="text-xs font-medium text-gray-600 mb-1 block">{adminT("admin.ui.1062")}</label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{adminT("admin.ui.0132")}</SelectItem>
                <SelectItem value="android">{adminT("admin.ui.1063")}</SelectItem>
                <SelectItem value="ios">{adminT("admin.ui.1064")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || loading || !fcmOn || !body.trim()}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {adminT("admin.ui.1065")} </Button>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-800 mb-1">{adminT("admin.ui.1066")}</p>
        <p>
          {adminT("admin.ui.1067")} </p>
      </div>
    </div>
  );
}
