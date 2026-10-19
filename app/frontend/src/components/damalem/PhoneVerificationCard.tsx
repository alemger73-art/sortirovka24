import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useLanguage} from '@/contexts/LanguageContext';
import {accountApi,getAccountToken,type OtpChannel} from '@/lib/accountApi';
import {getAPIBaseURL} from '@/lib/config';

export default function PhoneVerificationCard({onVerified}:{onVerified:()=>void}) {
  const {lang}=useLanguage();
  const [hasPhone,setHasPhone]=useState<boolean|null>(null);
  useEffect(()=>{let active=true;accountApi.me().then(p=>{if(active)setHasPhone(Boolean(p.phone));}).catch(()=>{if(active)setError('Не удалось загрузить телефон. Откройте настройки аккаунта.');});return()=>{active=false;};},[]);
  const [code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[until,setUntil]=useState(0);
  const [channels,setChannels]=useState<OtpChannel[]>([]),[channel,setChannel]=useState<OtpChannel|null>(null),[botUrl,setBotUrl]=useState('');
  useEffect(()=>{let active=true;accountApi.otpChannels().then(r=>{if(active)setChannels(r.channels||[]);}).catch(()=>{});return()=>{active=false;};},[]);
  const channelName=(c:OtpChannel|null)=>c==='whatsapp'?'WhatsApp':c==='telegram'?'Telegram':'SMS';
  async function send(confirm=false,via:OtpChannel|null=channel) {
    if(busy)return;
    if(!confirm&&Date.now()<until&&via===channel){setError('Код уже отправлен. Подождите минуту перед повторной отправкой.');return;}
    setBusy(true);setError('');
    try {
      const response=await fetch(`${getAPIBaseURL()}/api/v1/account/phone/${confirm?'confirm':'request-sms'+(via?`?channel=${via}`:'')}`,{method:'POST',headers:{Authorization:`Bearer ${getAccountToken()}`,'Content-Type':'application/json'},...(confirm?{body:JSON.stringify({code})}:{})});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не удалось подтвердить телефон');
      if(confirm)onVerified();else{if(data.channel)setChannel(data.channel as OtpChannel);else if(!sent)setChannel(via);setBotUrl(data.bot_url||'');if(data.on_screen_code_hint)setError(data.on_screen_code_hint);setSent(true);setUntil(Date.now()+Number(data.resend_after_seconds||60)*1000);}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(hasPhone===null)return <p role="status">{error|| (lang==='kz'?'Телефон тексерілуде…':'Проверяем телефон…')}</p>;
  if(!hasPhone)return <div className="space-y-3 rounded-xl border bg-card p-4"><p>{lang==='kz'?'Бұрынғы тапсырыстар мен бонустарды көру үшін телефонды қосып, растаңыз.':'Чтобы открыть прежние заказы и бонусы, добавьте и подтвердите телефон.'}</p><Link to="/cabinet?tab=settings" className="inline-block rounded-lg bg-primary px-4 py-3 text-primary-foreground">{lang==='kz'?'Телефонды қосу':'Добавить телефон'}</Link></div>;
  const kz=lang==='kz';
  const options:OtpChannel[]=channels.length?channels:['sms'];
  const style=(c:OtpChannel)=>c==='whatsapp'?'bg-[#25D366] text-white':c==='telegram'?'bg-[#229ED9] text-white':'border';
  return <div className="space-y-3 rounded-xl border bg-card p-4"><p className="font-semibold">{kz?'Телефонды растаңыз':'Подтвердите телефон'}</p><p className="text-sm text-muted-foreground">{kz?'Код профильдегі нөміріңізге келеді. Растағаннан кейін бұрынғы тапсырыстар мен бонустар ашылады.':'Код придёт на номер из профиля. После подтверждения откроются ваши бонусы за заказы и прежние заказы на этот номер.'}</p>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex flex-wrap gap-2">{options.map(c=><button key={c} type="button" disabled={busy} onClick={()=>void send(false,c)} className={`rounded-lg px-4 py-3 font-semibold disabled:opacity-50 ${style(c)}`}>{sent&&channel===c?(kz?'Қайта жіберу':'Отправить ещё раз'):(kz?`Кодты ${channelName(c)} арқылы алу`:`Получить код в ${channelName(c)}`)}</button>)}</div>{sent&&botUrl&&channel==='telegram'&&<a href={botUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-[#229ED9] px-4 py-3 text-center font-semibold text-white">{kz?'Ботты ашып, код алу':'Открыть бота и получить код'}</a>}{sent&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void send(true);}}><label className="text-sm">{kz?`${channelName(channel)} кодты`:`Код из ${channelName(channel)}`}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))} className="mt-1 block w-36 rounded-lg border bg-background p-3"/></label><button disabled={busy||code.length!==6} className="self-end rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50">{kz?'Растау':'Подтвердить'}</button></form>}</div>;
}
