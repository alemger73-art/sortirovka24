import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiUrl } from '@/lib/config';
import { partnerLogin } from '@/lib/partnerAuthApi';
import AdminDamAlem from './AdminDamAlem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const deviceKey='dam_operator_workstation';
export default function DamOperatorDesktop() {
  const [device,setDevice]=useState(()=>localStorage.getItem(deviceKey)||'');
  const [name,setName]=useState('');
  const [login,setLogin]=useState(''); const [password,setPassword]=useState(''); const [pin,setPin]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [install,setInstall]=useState<any>(null);
  const lock=useRef(false);
  useEffect(()=>{
    sessionStorage.removeItem('dam_workstation_session');
    const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]'); const old=manifest?.href;
    if(manifest)manifest.href='/operator.webmanifest';
    const listener=(e:Event)=>{e.preventDefault();setInstall(e);};
    window.addEventListener('beforeinstallprompt',listener);
    return ()=>{window.removeEventListener('beforeinstallprompt',listener);sessionStorage.removeItem('dam_workstation_session');if(manifest&&old)manifest.href=old;};
  },[]);
  async function request(path:string,token:string,body:unknown) {
    const r=await fetch(apiUrl('/api/v1/dam-alem/workstation/'+path),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok){if(r.status===401&&path==='enter'){localStorage.removeItem(deviceKey);setDevice('');}throw new Error(typeof data.detail==='string'?data.detail:'Проверьте данные и повторите попытку');}
    return data;
  }
  async function submit(e:FormEvent){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      if(!device){
        const auth=await partnerLogin('dam_alem',login,password);
        if(!auth.success)throw new Error(auth.message||'Проверьте логин и пароль владельца');
        const result=await request('authorize',auth.token,{});
        localStorage.setItem(deviceKey,result.device_token);setDevice(result.device_token);setPassword('');setLogin('');
      }else{
        const result=await request('enter',device,{pin});
        sessionStorage.setItem('dam_workstation_session',result.token);setName(result.name);setPin('');
      }
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  function leave(){sessionStorage.removeItem('dam_workstation_session');setName('');setPin('');setError('');}
  return <div className="min-h-screen bg-slate-950 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><strong>DÄM ALEM · Оператор</strong><p className="text-xs text-slate-400">{name ? `Сотрудник: ${name}` : 'Рабочее место'}</p></div>{name && <Button variant="outline" onClick={leave}>Заблокировать / сменить сотрудника</Button>}</header>
    {name ? <main className="mx-auto max-w-7xl bg-background text-foreground p-4"><p className="mb-4 text-sm text-muted-foreground">Чтобы закончить работу, закройте смену ниже. Блокировка экрана сохраняет открытую смену.</p><AdminDamAlem partnerMode initialSection="orders" /></main> : <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">{device?'Начать смену':'Подключить ноутбук'}</h1><p className="mt-3 text-slate-400">{device?'Введите свой PIN. Если смена уже открыта, вы продолжите её.':'Владелец один раз вводит свой логин и пароль. После подключения операторы входят по личному PIN. Разрешение действует 30 дней.'}</p>
      <form onSubmit={submit} className="mt-7 space-y-4">{device?<label className="block">PIN оператора<Input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} className="mt-2 h-16 text-center text-3xl tracking-[.6em] bg-slate-900" required minLength={4}/></label>:<><label className="block">Логин владельца<Input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required className="mt-2 bg-slate-900"/></label><label className="block">Пароль владельца<Input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required className="mt-2 bg-slate-900"/></label></>}
      {error&&<p role="alert" className="rounded-xl bg-red-950 p-3 text-red-200">{error}</p>}<Button className="h-12 w-full bg-orange-600 hover:bg-orange-500" disabled={busy}>{busy?'Проверяем…':device?'Войти и открыть смену':'Подключить рабочее место'}</Button></form>
      <div className="mt-8 rounded-2xl border border-white/10 p-4 text-sm text-slate-300"><strong>Как программа на компьютере</strong><p className="mt-2">В Chrome или Edge откройте меню браузера → «Установить страницу как приложение» / «Приложения». Появится отдельное окно и ярлык. Для работы нужен интернет.</p>{install&&<Button className="mt-3 w-full" onClick={async()=>{await install.prompt();setInstall(null);}}>Установить на компьютер</Button>}</div>
      {device&&<button className="mt-5 text-sm text-slate-400 underline" onClick={()=>{localStorage.removeItem(deviceKey);setDevice('');}}>Отключить это рабочее место</button>}
    </main>}
  </div>;
}
