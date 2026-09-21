import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, RefreshCw, Truck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { foodOperations } from '@/lib/foodOperations';
import { formatTenge } from '@/lib/logisticsApi';
import { Button } from '@/components/ui/button';

interface Delivery {
  order_id: number; status: string; delivery_status: string; address: string;
  customer_name: string; amount_due: number; courier_name: string | null;
  courier_phone: string | null;
}
const lane = (item: Delivery) => item.status === 'in_progress'
  ? 'transit' : item.status === 'ready' ? 'waiting' : 'preparing';

export default function DamDeliveries({ openOrder }: { openOrder: (id: number) => void }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<Delivery[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const response = await foodOperations<{ items: Delivery[] }>('/deliveries');
      if (current !== generation.current) return;
      setItems(response.items); setError('');
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => { clearInterval(timer); generation.current++; };
  }, [load]);
  return <section className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" />{t('cabinet.deliveries')}</h3>
      <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('cabinet.refresh')}</Button>
    </div>
    <p className="text-sm text-muted-foreground">{t('dam.delivery.operatorHelp')}</p>
    {error && <p role="alert" className="rounded-xl border border-destructive p-3 text-destructive">{error}</p>}
    {!loading && !error && !items.length && <p role="status" className="rounded-xl bg-muted p-5">{t('cabinet.empty')}</p>}
    <div className="grid gap-4 lg:grid-cols-3">
      {(['preparing', 'waiting', 'transit'] as const).map(group => <div key={group} className="min-w-0 rounded-2xl border bg-muted/30 p-3">
        <h4 className="mb-3 font-semibold">{t(`cabinet.${group}`)} <span className="text-muted-foreground">{items.filter(item => lane(item) === group).length}</span></h4>
        <div className="space-y-3">{items.filter(item => lane(item) === group).map(item => <article key={item.order_id} className="space-y-3 rounded-xl border bg-card p-4 break-words">
          <strong>{t('cabinet.order')} #{item.order_id}</strong>
          <p className="text-sm">{item.customer_name}<br />{item.address}</p>
          <p className="text-sm font-medium">{item.courier_name || t('dam.delivery.operatorHelp')}</p>
          {item.courier_phone && <a className="inline-flex items-center gap-2 text-sm underline" href={`tel:${item.courier_phone.replace(/[^+\d]/g, '')}`}><Phone className="h-4 w-4" />{item.courier_phone}</a>}
          <p className="text-sm">{t('cabinet.due')}: <strong>{formatTenge(item.amount_due)}</strong></p>
          <Button variant="outline" className="w-full" onClick={() => openOrder(item.order_id)}>{t('cabinet.openOrder')}</Button>
        </article>)}</div>
      </div>)}
    </div>
  </section>;
}
