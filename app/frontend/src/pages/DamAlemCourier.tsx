import { type FormEvent, useEffect, useState } from 'react';
import { Bike, Delete, Loader2, LockKeyhole, LogIn } from 'lucide-react';
import { toast } from 'sonner';

import CabinetCourier from '@/pages/CabinetCourier';
import { Button } from '@/components/ui/button';
import { clearCourierToken, getCourierToken, setCourierToken } from '@/lib/courierSession';
import { logisticsApi } from '@/lib/logisticsApi';

export default function DamAlemCourier() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getCourierToken()));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setAuthenticated(Boolean(getCourierToken()));
    window.addEventListener('s24:courier-auth-changed', sync);
    return () => window.removeEventListener('s24:courier-auth-changed', sync);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    try {
      const session = await logisticsApi.courierPinLogin(pin);
      setCourierToken(session.token);
      setAuthenticated(true);

      try {
        let cabinet = await logisticsApi.courierCabinet();
        if (!cabinet.shift) {
          await logisticsApi.openShift(pin);
          cabinet = await logisticsApi.courierCabinet();
        }
        if (!cabinet.profile.online) await logisticsApi.setOnline(true);
        toast.success(`Смена открыта: ${session.name}`);
      } catch (error) {
        toast.error(String((error as Error)?.message || 'Вход выполнен. Откройте смену в кабинете.'));
      }
      setPin('');
    } catch (error) {
      clearCourierToken();
      setAuthenticated(false);
      toast.error(String((error as Error)?.message || 'Не удалось войти'));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearCourierToken();
    setAuthenticated(false);
    setPin('');
  }

  if (authenticated) {
    return <CabinetCourier standalone onLogout={logout} />;
  }

  return (
    <main className="min-h-[100dvh] bg-[#090f1d] text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 shadow-2xl shadow-orange-950/40">
            <Bike className="h-10 w-10" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-400">DÄM ALEM</p>
          <h1 className="mt-2 text-3xl font-black">Кабинет курьера</h1>
          <p className="mt-2 text-sm text-slate-400">Введите личный PIN, выданный владельцем</p>
        </div>

        <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3">
            <LockKeyhole className="h-5 w-5 text-orange-400" />
            <input
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              aria-label="PIN курьера"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              className="min-w-0 flex-1 bg-transparent text-center text-3xl font-black tracking-[0.55em] text-white outline-none placeholder:text-slate-700"
              placeholder="••••"
            />
            <button type="button" onClick={() => setPin('')} className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Очистить PIN">
              <Delete className="h-5 w-5" />
            </button>
          </div>

          <Button type="submit" disabled={busy || pin.length !== 4} className="h-14 w-full rounded-2xl bg-orange-600 text-base font-black text-white hover:bg-orange-500">
            {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
            Войти и начать смену
          </Button>

          <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
            После входа курьер увидит только назначенные доставки, адрес, оплату и действия по заказу.
          </p>
        </form>
      </div>
    </main>
  );
}
