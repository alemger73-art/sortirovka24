import {useState} from 'react';
import {getAccountToken} from '@/lib/accountApi';
import {getAPIBaseURL} from '@/lib/config';

export default function PhoneVerificationCard({onVerified}:{onVerified:()=>void}) {
  const [code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[until,setUntil]=useState(0);
  async function send(confirm=false) {
    if(busy)return;
    if(!confirm&&Date.now()<until){setError('Код уже отправлен. Подождите минуту перед повторной отправкой.');return;}
    setBusy(true);setError('');
    try {
      const response=await fetch(`${getAPIBaseURL()}/api/v1/account/phone/${confirm?'confirm':'request-sms'}`,{method:'POST',headers:{Authorization:`Bearer ${getAccountToken()}`,'Content-Type':'application/json'},...(confirm?{body:JSON.stringify({code})}:{})});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не удалось подтвердить телефон');
      if(confirm)onVerified();else{setSent(true);setUntil(Date.now()+Number(data.resend_after_seconds||60)*1000);}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="space-y-3 rounded-xl border bg-card p-4"><p className="font-semibold">Подтвердите телефон аккаунта</p><p className="text-sm text-muted-foreground">SMS отправится на ваш номер из профиля. После подтверждения откроются ваши прежние заказы и бонусы. Номер другого человека привязать нельзя.</p>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} onClick={()=>void send()} className="rounded-lg border px-4 py-3 disabled:opacity-50">{sent?'Отправить код повторно':'Получить SMS-код'}</button>{sent&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void send(true);}}><label className="text-sm">Код из SMS<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))} className="mt-1 block w-36 rounded-lg border bg-background p-3"/></label><button disabled={busy||code.length!==6} className="self-end rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50">Подтвердить телефон</button></form>}</div>;
}
