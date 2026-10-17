import { type FormEvent, useEffect, useState } from "react";
import { Bike, Delete, Loader2, LockKeyhole, LogIn } from "lucide-react";
import { toast } from "sonner";

import {useLanguage} from '@/contexts/LanguageContext';
import CourierInstall from "@/components/damalem/CourierInstall";
import CabinetCourier from "@/pages/CabinetCourier";
import { Button } from "@/components/ui/button";
import {
  clearCourierToken,
  getCourierToken,
  setCourierToken,
} from "@/lib/courierSession";
import { logisticsApi } from "@/lib/logisticsApi";

export default function DamAlemCourier() {
  const {lang,setLang}=useLanguage();const say=(ru:string,kz:string)=>lang==='kz'?kz:ru;
  const [authenticated, setAuthenticated] = useState(() =>
    Boolean(getCourierToken()),
  );
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionKey, setSessionKey] = useState(() => getCourierToken());

  useEffect(() => {
    const sync = () => {setSessionKey(getCourierToken());setAuthenticated(Boolean(getCourierToken()));};
    window.addEventListener("s24:courier-auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("s24:courier-auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    try {
      const session = await logisticsApi.courierPinLogin(pin);
      setCourierToken(session.token);
      const cabinet=await logisticsApi.courierCabinet();
      if(!cabinet.shift)throw new Error(say('Смена не открылась. Повторите вход по PIN.','Ауысым ашылмады. PIN арқылы қайта кіріңіз.'));
      setAuthenticated(true);
      toast.success(say('Смена открыта: ','Ауысым ашылды: ')+session.name);
      setPin("");
    } catch (error) {
      clearCourierToken();
      setAuthenticated(false);
      toast.error(String((error as Error)?.message || say("Не удалось войти","Кіру мүмкін болмады")));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearCourierToken();
    setAuthenticated(false);
    setPin("");
  }

  if (authenticated && !busy) {
    return <><CourierInstall /><CabinetCourier key={sessionKey} standalone onLogout={logout} /></>;
  }

  return (
    <main className="min-h-[100dvh] bg-[#090f1d] text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm"><div className="mb-4 flex justify-end gap-2"><Button variant="ghost" className="min-h-11 min-w-14 text-white" onClick={()=>setLang('ru')}>RU</Button><Button variant="ghost" className="min-h-11 min-w-14 text-white" onClick={()=>setLang('kz')}>KZ</Button></div>
        <CourierInstall />
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 shadow-2xl shadow-orange-950/40">
            <Bike className="h-10 w-10" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-400">
            DÄM ALEM
          </p>
          <h1 className="mt-2 text-3xl font-black">{say("Кабинет курьера","Курьер кабинеті")}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {say("Введите личный PIN — вход откроет смену","Жеке PIN енгізіңіз — кіру ауысымды ашады")}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl"
        >
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3">
            <LockKeyhole className="h-5 w-5 text-orange-400" />
            <input
              type="password"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              aria-label={say("PIN курьера","Курьер PIN коды")}
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="min-w-0 flex-1 bg-transparent text-center text-3xl font-black tracking-[0.55em] text-white outline-none placeholder:text-slate-700"
              placeholder="••••"
            />
            <button
              type="button"
              onClick={() => setPin("")}
              className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-white"
              aria-label={say("Очистить PIN","PIN тазалау")}
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>

          <Button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="h-14 w-full rounded-2xl bg-orange-600 text-base font-black text-white hover:bg-orange-500"
          >
            {busy ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-5 w-5" />
            )}
            {say("Войти и начать смену","Кіру және ауысымды бастау")}
          </Button>

          <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
            {say("Ваши задания, связь с оператором и заработок — в одном кабинете.","Тапсырмалар, оператормен байланыс және табыс — бір кабинетте.")}
          </p>
        </form>
      </div>
    </main>
  );
}
