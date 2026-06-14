import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { client, withRetry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import StorageImg from '@/components/StorageImg';
import { ExternalLink, Image, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface BannerRow {
  id: number;
  title: string;
  subtitle?: string;
  image_url?: string;
  button_text?: string;
  button_url?: string;
  active?: boolean;
}

export default function AdminDamAlemBanners() {
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.banners.query({ query: { active: true }, limit: 20 }));
      const rows: BannerRow[] = res?.data?.items || [];
      const foodBanners = rows.filter(b => {
        const url = (b.button_url || '').toLowerCase();
        const title = (b.title || '').toLowerCase();
        return url.includes('/food') || title.includes('dam alem') || title.includes('доставка еды');
      });
      setBanners(foodBanners);
    } catch (e) {
      console.error(e);
      toast.error('Не удалось загрузить баннеры');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-[#FF3B30]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Баннеры на странице DAM ALEM</p>
          <p className="mt-1 text-xs text-gray-600">
            Показываются баннеры с ссылкой на <code className="rounded bg-white px-1">/food</code> или с «DAM ALEM» в заголовке.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="border-orange-200">
          <Link to="/admin?tab=banners">
            <Plus className="mr-1 h-4 w-4" />
            Все баннеры
          </Link>
        </Button>
      </div>

      {banners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <Image className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium text-gray-800">Нет баннеров для DAM ALEM</p>
          <p className="mt-1 text-sm text-gray-500">Создайте баннер в разделе «Баннеры» с кнопкой на /food</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {banners.map(b => (
            <div key={b.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="relative aspect-[16/7] bg-gray-100">
                {b.image_url ? (
                  <StorageImg objectKey={b.image_url} alt={b.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#FF3B30] to-[#c41e14] text-white/50">
                    <Image className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900">{b.title}</h3>
                {b.subtitle && <p className="mt-1 text-sm text-gray-500">{b.subtitle}</p>}
                <p className="mt-2 text-xs text-gray-400">
                  Кнопка: {b.button_text || '—'} → {b.button_url || '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        <Link to="/food" target="_blank" className="inline-flex items-center gap-1 text-[#FF3B30] hover:underline">
          Посмотреть на витрине <ExternalLink className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}
