/** Paid «Поднять»: whether lifting an ad costs money now (Kaspi invoice) and how much. Free while payments are off. */
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/config';

export type BoostPrice = { paid: boolean; price: number; days: number };
export type BoostPayment = { status: 'sent'; amount: number; phone: string; again: boolean };

const FREE: BoostPrice = { paid: false, price: 0, days: 7 };
let loading: Promise<BoostPrice> | null = null;

function loadBoostPrice(): Promise<BoostPrice> {
  loading ??= fetch(apiUrl('/api/v1/payments/boost-price'))
    .then(r => (r.ok ? r.json() : FREE))
    .catch(() => { loading = null; return FREE; });
  return loading;
}

export function useBoostPrice(): BoostPrice {
  const [price, setPrice] = useState<BoostPrice>(FREE);
  useEffect(() => {
    let live = true;
    void loadBoostPrice().then(p => { if (live) setPrice(p); });
    return () => { live = false; };
  }, []);
  return price;
}

/** What to tell the author after the invoice went to Kaspi. */
export function invoiceSentText(p: BoostPayment, kz: boolean): { title: string; body: string } {
  const sum = `${p.amount.toLocaleString('ru-RU')} ₸`;
  return kz
    ? { title: `Kaspi-ге ${sum} шот жіберілді`, body: `${p.phone} нөміріне. Kaspi-дегі шотты төлеңіз — хабарландыру өзі көтеріледі.` }
    : { title: p.again ? `Счёт на ${sum} уже в Kaspi` : `Счёт на ${sum} отправлен в Kaspi`,
        body: `На номер ${p.phone}. Откройте уведомление Kaspi о счёте и оплатите — объявление поднимется само.` };
}
