/** «Мой магазин»: for an account whose confirmed number is a partner shop's — one tap to its cabinet. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Store } from 'lucide-react';
import { shopCabinet, type MyShop } from '@/lib/partnerShop';

export default function MyShopLink({ className }: { className?: string }) {
  const [shops, setShops] = useState<MyShop[]>([]);
  useEffect(() => {
    let live = true;
    shopCabinet.mine().then(items => { if (live) setShops(items); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!shops.length) return null;
  return <div className={className}>{shops.map(shop => (
    <Link key={shop.slug} to={`/shop/${shop.slug}/cabinet`} className="mb-2 flex items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-50">
      {shop.logo ? <img src={shop.logo} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <Store className="h-11 w-11 shrink-0 p-2" />}
      <span className="min-w-0 flex-1"><small className="block text-xs font-semibold text-emerald-700 dark:text-emerald-300">Мой магазин</small>
        <b className="block truncate">{shop.name}: заказы и товары</b></span>
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
    </Link>
  ))}</div>;
}
