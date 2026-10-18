import { useLanguage } from '@/contexts/LanguageContext';
import { useStoreTranslations } from '@/i18n/storeTranslations';
import PhoneVerificationCard from './PhoneVerificationCard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Copy, Gift } from 'lucide-react';
import { bonusKinds, bonusNumber, clientLoyalty, type MyLoyalty } from '@/lib/loyalty';
import {crmClient,type CRMProfile} from '@/lib/crm';
import { DAM_ALEM_STOREFRONT_URL } from '@/lib/damAlem';

export default function ClientLoyalty() {
  const st = useStoreTranslations();
  const { lang } = useLanguage();
  const locale = lang === 'kz' ? 'kk-KZ' : 'ru-KZ';
  const [data,setData]=useState<MyLoyalty|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [pending,setPending]=useState(()=>sessionStorage.getItem('dam_referral')||'');
  const [businesses,setBusinesses]=useState<{business_id:string;name:string;loyalty:MyLoyalty}[]>([]),[business,setBusiness]=useState('dam_alem'),[profile,setProfile]=useState<CRMProfile|null>(null);
  const generation=useRef(0);
  const load=useCallback(()=>{const request=++generation.current;void (async()=>{
    try {
      const dam=business==='dam_alem'?await clientLoyalty<MyLoyalty>('/me'):null;
      if(dam?.phone_verification_required_for_business){
        if(request!==generation.current)return;
        setBusinesses([{business_id:'dam_alem',name:'DAM ALEM 2.0',loyalty:dam}]);
        setData(dam);setProfile(null);setError('');return;
      }
      const all=await crmClient<{business_id:string;name:string;loyalty:MyLoyalty}[]>('/businesses');
      const selected=await crmClient<CRMProfile>('/businesses/'+encodeURIComponent(business));
      if(request!==generation.current)return;
      setBusinesses(all);setData(dam||all.find(x=>x.business_id===business)?.loyalty||null);setProfile(selected);setError('');
    }catch(e){if(request===generation.current)setError((e as Error).message);}
  })();},[business]);
  useEffect(()=>{setData(null);setProfile(null);load();const timer=setInterval(()=>{if(!document.hidden)load();},30000);return()=>{generation.current++;clearInterval(timer);};},[load]);
  const changeConsent=async(enabled:boolean)=>{try{await crmClient('/businesses/'+business+'/consent','PATCH',{marketing_opt_in:enabled});if(profile)setProfile({...profile,marketing_opt_in:enabled});setNotice(st('Настройка уведомлений сохранена'));}catch(e){setError((e as Error).message);}};
  const shareLink=data?`${DAM_ALEM_STOREFRONT_URL}?ref=${encodeURIComponent(data.referral_code)}`:'';
  const share=async(copy=false)=>{try{const text=st('Пригласи друга в DAM ALEM 2.0');if(!copy&&navigator.share)await navigator.share({title:'DAM ALEM 2.0',text,url:shareLink});else{await navigator.clipboard.writeText(shareLink);setNotice(st('Ссылка скопирована'));}}catch(e){if((e as Error).name!=='AbortError')setError(st('Не удалось поделиться. Скопируйте ссылку из поля ниже.'));}};
  const bind=async()=>{try{await clientLoyalty('/referral',{code:pending});sessionStorage.removeItem('dam_referral');setPending('');setNotice(st('Приглашение сохранено'));load();}catch(e){setError((e as Error).message);}};
  return <section className="space-y-5" aria-label={st("Мои бонусы")}>
    <header><h2 className="text-2xl font-bold">{st("Мои бонусы")}</h2><p className="text-sm text-muted-foreground">{businesses.find(x=>x.business_id===business)?.name||'DÄM ALEM 2.0'}{" " + st("· 1 бонус = 1 ₸ скидки")}</p></header>
    {businesses.length>1&&<label className="block text-sm">{st("Бизнес")}<select aria-label={st("Бонусы бизнеса")} className="mt-1 w-full rounded-xl border bg-background p-3" value={business} onChange={e=>setBusiness(e.target.value)}>{businesses.map(b=><option key={b.business_id} value={b.business_id}>{b.name}</option>)}</select></label>}
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}<button className="ml-3 underline" onClick={load}>{st("Повторить")}</button></div>}
    {/подтвердите телефон|телефон.*подтвержд/i.test(error)&&<PhoneVerificationCard onVerified={load}/>}
    {notice&&<p role="status" className="text-emerald-600">{notice}</p>}
    {!data&&!error&&<div className="h-36 animate-pulse rounded-2xl bg-muted"/>}
    {data&&<>
      {data.phone_verification_required_for_business&&<div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"><p className="font-semibold">{st("Бонусы за заказы ждут подтверждения номера")}</p><p className="text-sm">{st("Начисления за заказы привязаны к номеру телефона. Подтвердите свой номер кодом — и они появятся здесь.")}</p><PhoneVerificationCard onVerified={load}/></div>}
      {!data.enrolled&&<p className="rounded-xl border p-3">{st("Участие в бонусной программе не активно. Сохранённые операции остаются в истории.")}</p>}
      {profile&&<div className="rounded-xl border p-4"><h3 className="font-semibold">{st("Моя история в этом бизнесе")}</h3><p className="mt-2 text-sm">{st("Завершённых оплаченных заказов:") + " "}{profile.orders_count}</p>{profile.recent.slice(0,5).map(o=><Link key={o.id} className="mt-2 block text-sm underline" to={'/cabinet/orders/food/'+o.id}>{st("Заказ №")}{o.id}{" " + st("·") + " "}{bonusNumber(o.total_amount)}{" " + st("₸")}</Link>)}{profile.addresses.length>0&&<p className="mt-3 text-sm text-muted-foreground">{st("Адреса:") + " "}{profile.addresses.join('; ')}</p>}<label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={profile.marketing_opt_in} onChange={e=>void changeConsent(e.target.checked)}/>{st("Получать предложения этого бизнеса. Уведомления о заказах приходят отдельно.")}</label></div>}

      <div className="rounded-2xl border bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"><p>{st("Доступный баланс")}</p><p className="mt-2 text-4xl font-bold">{bonusNumber(data.balance)} <span className="text-base font-normal">{st("бонусов")}</span></p><p className="mt-1">{bonusNumber(data.balance)}{" " + st("₸ на будущие заказы")}</p><p className="mt-3 text-sm">{st("Оплачивайте бонусами до") + " "}{data.rules.max_spend_percent}{st("% еды после скидок. Доставка оплачивается отдельно. Бонусы нельзя вывести наличными.")}</p>{business==='dam_alem'&&<Link to="/food" className="mt-4 inline-block rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white">{st("Открыть меню")}</Link>}</div>
      {business==='dam_alem'&&<div className="rounded-xl border p-4"><h3 className="font-semibold">{st("300 бонусов Сортировка24 за регистрацию")}</h3><p className="mt-2 text-sm">{st("Остаток:") + " "}{bonusNumber(data.registration_balance)}{" " + st("бонусов. Действуют только в DAM ALEM, скидку предоставляет ресторан. Начисляются один раз; повторный вход и привязка Google или телефона не дают новый бонус.")}</p></div>}
      {Number(data.debt)>0&&<p className="rounded-xl border p-3 text-sm">{st("После возврата заказа нужно компенсировать") + " "}{bonusNumber(data.debt)}{" " + st("ранее потраченных бонусов. Будущие начисления сначала погасят эту сумму.")}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4"><strong>{data.rules.cashback_rate}{st("% за заказы")}</strong><p className="mt-1 text-sm text-muted-foreground">{st("После полной оплаты и завершения. Срок —") + " "}{data.rules.regular_days}{" " + st("дней.")}</p></div><div className="rounded-xl border p-4"><strong>{st("+")}{data.rules.welcome_amount}{" " + st("за первый заказ")}</strong><p className="mt-1 text-sm text-muted-foreground">{st("После оплаты и получения. Срок —") + " "}{data.rules.welcome_days}{" " + st("дней.") + " "}</p></div></div>
      {data.expires.length>0&&<div className="rounded-xl border p-4"><h3 className="font-semibold">{st("Срок действия")}</h3>{data.expires.slice(0,6).map((x,i)=><p key={i} className="mt-2 flex justify-between gap-3 text-sm"><span>{bonusNumber(x.amount)}{" " + st("бонусов")}</span><span>{st('до {0}', [new Date(x.at).toLocaleDateString(locale)])}</span></p>)}</div>}
      {pending&&business==='dam_alem'&&<div className="rounded-xl border p-4"><p>{st("Вы перешли по приглашению друга.")}</p><button className="mt-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={bind}>{st("Применить приглашение")}</button></div>}
      {data.rules.referral_enabled&&data.referral_code&&business==='dam_alem'&&<div className="rounded-2xl border p-5"><h3 className="flex items-center gap-2 font-semibold"><Gift size={20}/>{" " + st("Поделиться с другом")}</h3><p className="my-3 text-sm text-muted-foreground">{st("После первого оплаченного и завершённого заказа друга вы получите") + " "}{data.rules.referral_amount}{" " + st("бонусов. Приглашение проходит проверку.")}</p><div className="flex flex-wrap gap-2"><button onClick={()=>share()} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground"><Share2 size={18}/>{st("Поделиться")}</button><button onClick={()=>share(true)} className="flex items-center gap-2 rounded-xl border px-4 py-3"><Copy size={18}/>{st("Скопировать ссылку")}</button></div><input aria-label={st("Ваша ссылка приглашения")} className="mt-3 w-full rounded-lg border bg-background p-2 text-xs" readOnly value={shareLink} onFocus={e=>e.target.select()}/></div>}
      <div><h3 className="mb-3 text-lg font-semibold">{st("История операций")}</h3>{data.history.length===0?<p className="text-muted-foreground">{st("Пока нет операций. Бонусы появятся после первого успешного заказа.")}</p>:data.history.filter(x=>x.kind!=='LEGACY_OPENING'||Number(x.amount)!==0).map(x=><div key={x.id} className="flex justify-between gap-4 border-b py-3"><div><p className="text-sm font-medium">{st(bonusKinds[x.kind] || x.kind)}{x.reason && <span className="block text-xs text-muted-foreground">{x.reason}</span>}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(x.created_at).toLocaleString(locale)}{x.order_id?st(' · Заказ №{0}', [x.order_id]):''}</p></div><strong className={Number(x.amount)>0?'text-emerald-600':''}>{Number(x.amount)>0?'+':''}{bonusNumber(x.amount)}</strong></div>)}</div>
    </>}
  </section>;
}
