import { useCallback, useEffect, useState } from 'react';
import { Clock3, KeyRound, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { foodShifts } from '@/lib/foodOperations';
import { useLanguage } from '@/contexts/LanguageContext';

export interface DamShift {
  id: number; staff_name: string; role: string; opened_at: string; closed_at?: string | null;
  duration_seconds?: number | null; active: boolean;
}
interface ShiftState { staff: { id?: number; name: string; role: string; pin_set: boolean }; shift: DamShift | null }

export default function DamShiftPanel({ onChange }: { onChange?: (shift: DamShift | null) => void }) {
  const { t } = useLanguage();
  const [state, setState] = useState<ShiftState | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const next = await foodShifts<ShiftState>('/me'); setState(next); onChange?.(next.shift); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, [onChange]);
  useEffect(() => { void load(); }, [load]);
  async function mutate(action: 'open' | 'close') {
    if (!/^\d{4}$/.test(pin) || busy) return;
    setBusy(true); setError('');
    try { await foodShifts(`/${action}`, 'POST', { pin }); setPin(''); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (!state && !error) return <div className="h-20 animate-pulse rounded-2xl bg-muted" />;
  return <section className={`rounded-2xl border p-4 ${state?.shift ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'}`}>
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <span className={`rounded-xl p-2 ${state?.shift ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}><Clock3 className="h-5 w-5" /></span>
        <div><h3 className="font-bold">{state?.shift ? t('dam.shift.openNow') : t('dam.shift.closedNow')}</h3>
          {state?.shift ? <p className="text-sm text-muted-foreground">{state.shift.staff_name} · {new Date(state.shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p> : <p className="text-sm text-muted-foreground">{state?.staff.pin_set ? t('dam.shift.openHelp') : t('dam.shift.pinSetup')}</p>}
        </div>
      </div>
      {state?.staff.id && state.staff.pin_set && <div className="flex w-full gap-2 md:w-auto">
        <div className="relative flex-1 md:w-36"><KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input inputMode="numeric" autoComplete="off" maxLength={4} aria-label={t('dam.shift.pin')} placeholder="••••" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="pl-9 text-center tracking-[.4em]" /></div>
        <Button disabled={busy || pin.length !== 4} onClick={() => void mutate(state.shift ? 'close' : 'open')} variant={state.shift ? 'outline' : 'default'}>{state.shift ? <LogOut className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}{state.shift ? t('dam.shift.close') : t('dam.shift.open')}</Button>
      </div>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
  </section>;
}
