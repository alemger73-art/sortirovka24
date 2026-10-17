import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiUrl } from '@/lib/config';
import AdminDamAlem from './AdminDamAlem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';

export default function DamOperatorDesktop() {
  const {lang}=useLanguage(); const kz=lang==='kz';
  const [name,setName]=useState('');
  const [checking,setChecking]=useState(()=>Boolean(sessionStorage.getItem('dam_workstation_session')));
  const [retrySession,setRetrySession]=useState(0);
  const [pin,setPin]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [install,setInstall]=useState<any>(null);
  const lock=useRef(false);
  useEffect(()=>{
    const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]'); const old=manifest?.href;
    if(manifest)manifest.href='/operator.webmanifest';
    const listener=(e:Event)=>{e.preventDefault();setInstall(e);};
    window.addEventListener('beforeinstallprompt',listener);
    return ()=>{window.removeEventListener('beforeinstallprompt',listener);if(manifest&&old)manifest.href=old;};
  },[]);
  useEffect(()=>{
    let alive=true;
    async function restore(){
      const token=sessionStorage.getItem('dam_workstation_session');
      if(!token){setChecking(false);return;}
      try {
        const response=await fetch(apiUrl('/api/v1/dam-alem/shifts/me'),{headers:{Authorization:'Bearer '+token}});
        if(!alive || sessionStorage.getItem('dam_workstation_session')!==token)return;
        if(response.status===401 || response.status===403){sessionStorage.removeItem('dam_workstation_session');setName('');setError(kz?'PIN арқылы қайта кіріңіз.':'Сессия завершена. Введите PIN.');return;}
        if(!response.ok)throw new Error(kz?'Сессияны тексеру мүмкін болмады. Қайталаңыз.':'Не удалось проверить сессию. Повторите попытку.');
        const data=await response.json();
        if(!alive || sessionStorage.getItem('dam_workstation_session')!==token)return;
        if(data.staff.role!=='operator' || !data.shift){sessionStorage.removeItem('dam_workstation_session');setName('');return;}
        setName(data.staff.name);setError('');
      }catch(e){if(alive)setError((e as Error).message);}
      finally{if(alive)setChecking(false);}
    }
    void restore(); const timer=window.setInterval(()=>{if(!document.hidden)void restore();},15000);
    return ()=>{alive=false;window.clearInterval(timer);};
  },[retrySession,kz]);
  async function submit(e:FormEvent){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const response=await fetch(apiUrl('/api/v1/dam-alem/workstation/pin-login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});
      const result=await response.json();
      if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:kz?'PIN кодын тексеріңіз.':'Проверьте PIN и повторите попытку.');
      sessionStorage.setItem('dam_workstation_session',result.token);setName(result.name);setPin('');
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  function leave(){sessionStorage.removeItem('dam_workstation_session');setName('');setPin('');setError('');}
  return <div className="min-h-screen bg-slate-950 text-white">
    <header className="border-b border-white/10 px-5 py-4"><strong>{kz?'Оператор кабинеті':'Рабочее место оператора'} · DÄM ALEM</strong>{name&&<p className="text-xs text-slate-400">{name}</p>}</header>
    {checking ? <p role="status" className="p-5">{kz?'Сессия тексерілуде…':'Проверяем сессию…'}</p> : name ? <main className="mx-auto max-w-7xl bg-background text-foreground p-4"><p className="mb-4 text-sm text-muted-foreground">{kz?'Ауысым ашық. Жұмысты аяқтау үшін «Ауысымды жабу» басыңыз. Экранды бұғаттау ауысымды жаппайды.':'Смена открыта. Чтобы закончить работу, нажмите «Закрыть смену». Блокировка экрана сохраняет открытую смену.'}</p><AdminDamAlem partnerMode initialSection="orders" onLock={leave} /></main> : <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">{kz?'Оператордың кіруі':'Вход оператора'}</h1><p className="mt-3 text-slate-400">{kz?'Жеке PIN енгізіңіз. Кіру ауысымды ашады; ашық ауысым болса, оны жалғастырасыз.':'Введите личный PIN. Вход открывает смену; если она уже открыта, вы продолжите её.'}</p>
      <form onSubmit={submit} className="mt-7 space-y-4"><label className="block">{kz?'Оператор PIN коды':'PIN оператора'}<Input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} className="mt-2 h-16 text-center text-3xl tracking-[.6em] bg-slate-900" required minLength={4}/></label>
      {error&&<div role="alert" className="rounded-xl bg-red-950 p-3 text-red-200"><p>{error}</p>{sessionStorage.getItem('dam_workstation_session')&&<Button type="button" onClick={()=>{setChecking(true);setRetrySession(n=>n+1);}}>{kz?'Қайта тексеру':'Повторить проверку сессии'}</Button>}</div>}<Button className="h-12 w-full bg-orange-600 hover:bg-orange-500" disabled={busy||pin.length!==4}>{busy?(kz?'Тексерілуде…':'Проверяем…'):(kz?'Кіру және ауысымды ашу':'Войти и открыть смену')}</Button></form>
      <p className="mt-6 text-sm text-slate-400">{kz?'PIN кодын иесі «Команда» бөлімінде орнатады.':'PIN назначает владелец в разделе «Команда».'}</p>
      <div className="mt-8 rounded-2xl border border-white/10 p-4 text-sm text-slate-300"><strong>{kz?'Оператор қолданбасы':'Приложение оператора'}</strong><p className="mt-2">{kz?'Chrome немесе Edge мәзірінен қолданбаны орнатыңыз. iPhone: Safari → «Бөлісу» → «Басты экранға қосу».':'Установите приложение через меню Chrome или Edge. На iPhone: Safari → «Поделиться» → «На экран Домой».'}</p>{install&&<Button className="mt-3 w-full" onClick={async()=>{await install.prompt();setInstall(null);}}>{kz?'Қолданбаны орнату':'Установить приложение'}</Button>}</div>
    </main>}
  </div>;
}
