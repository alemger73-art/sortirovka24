import { useState, useEffect, useCallback } from 'react';
import { businessPartnerApi, type BusinessPartnerRequest } from '@/lib/businessPartnerApi';
import { invalidateAllCaches } from '@/lib/cache';
import { formatDate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Loader2, Phone, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новая', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-800' },
  done: { label: 'Обработана', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Отклонена', color: 'bg-red-100 text-red-800' },
};

export default function AdminBusinessPartners() {
  const [items, setItems] = useState<BusinessPartnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('new');
  const [viewItem, setViewItem] = useState<BusinessPartnerRequest | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await businessPartnerApi.list(filterStatus);
      setItems(res.items || []);
    } catch {
      toast.error('Ошибка загрузки заявок');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 30_000);
    return () => clearInterval(id);
  }, [fetchItems]);

  const changeStatus = async (id: number, status: string) => {
    try {
      await businessPartnerApi.updateStatus(id, status);
      toast.success('Статус обновлён');
      invalidateAllCaches();
      fetchItems();
      if (viewItem?.id === id) setViewItem({ ...viewItem, status });
    } catch {
      toast.error('Ошибка обновления');
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        {(['new', 'in_progress', 'done', 'rejected', 'all'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filterStatus === s ? 'default' : 'outline'}
            onClick={() => setFilterStatus(s)}
          >
            {s === 'all' ? 'Все' : (STATUS_MAP[s]?.label || s)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={fetchItems} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <p className="text-sm text-gray-500">{items.length} заявок на партнёрство</p>

      <div className="space-y-2">
        {items.map((item) => {
          const st = STATUS_MAP[item.status || 'new'] || STATUS_MAP.new;
          return (
            <Card key={item.id}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{item.name}</span>
                      <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                      <Badge variant="outline" className="text-xs">{item.activity}</Badge>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
                      {item.created_at && <span>{formatDate(item.created_at)}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewItem(item)}>
                    <Eye className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && (
          <p className="text-center text-gray-400 py-8">Нет заявок</p>
        )}
      </div>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Заявка партнёра #{viewItem?.id}</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>Имя:</strong> {viewItem.name}</p>
              <p><strong>Деятельность:</strong> {viewItem.activity}</p>
              <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {viewItem.phone}</p>
              {viewItem.whatsapp && (
                <p className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp: {viewItem.whatsapp}
                </p>
              )}
              {viewItem.description && <p><strong>Описание:</strong> {viewItem.description}</p>}
              {viewItem.created_at && <p className="text-gray-400 text-xs">{formatDate(viewItem.created_at)}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                {viewItem.status !== 'in_progress' && (
                  <Button size="sm" onClick={() => changeStatus(viewItem.id, 'in_progress')}>В работу</Button>
                )}
                {viewItem.status !== 'done' && (
                  <Button size="sm" variant="outline" onClick={() => changeStatus(viewItem.id, 'done')}>Обработана</Button>
                )}
                {viewItem.status !== 'rejected' && (
                  <Button size="sm" variant="destructive" onClick={() => changeStatus(viewItem.id, 'rejected')}>Отклонить</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
