import '@/i18n/adminTranslations'; // staff UI words (loaded only with this page)
import {MenuSelectionFields} from './MenuSelection';
import {estimateSelection,selectionErrors,type MenuProduct,type MenuSelection,type ModifierGroup} from '@/lib/damMenu';
import {CRMSearch} from './OwnerCRM';
import CashAmount from './CashAmount';
import PreorderFields, {scheduleISO} from './PreorderFields';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPublicLocale } from '@/i18n/publicLocale';
import { foodOperations, type OperatorOrder } from '@/lib/foodOperations';
import { accountApi } from '@/lib/accountApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Line = {line_index?: number; id?: number; name?: string; price?: number; modTotal?: number; quantity: number; modifiers: {option_id: number; name?: string; quantity?:number}[]; choices?:MenuSelection['choices']};
type Product = MenuProduct;
type Catalog = {products: Product[]; categories?: {id: number; name: string}[]; groups: {id: number; name: string; is_required: boolean; min_select: number; max_select: number}[]; options: {id: number; group_id: number; name: string; price: number}[]; links: {food_item_id: number; modifier_group_id: number}[]; zone_tariffs_required?: boolean; delivery_options?: {id: string; name: string; price: number; courier_payout?: number | null}[]};
type Quote = {delivery_tariff?: {zone_id:string;zone_name:string;customer_fee:number;courier_payout:number|null} | null; loyalty?: {maximum_spend:string;bonus_spent:string;eligible_amount:string;bonus_rate:string};promo_code?: string;items: {name: string; quantity: number; sum: number}[]; total_amount: number; subtotal?: number; delivery_fee?: number; service_fee?: number; discount?: number; adjustment?: number; previous_total?: number; paid_amount?: number; amount_due?: number; refund_due?: number; gift_choices?: {id: string; title: string}[]; gift_required?: boolean};
type Customer = {loyalty?: {balance:number;rules:{max_spend_percent:number;cashback_rate:number}};name: string; addresses: string[]; recent_orders: {id: number; amount: number; status: string}[]};

export default function OrderReceiptEditor({order, customerMode, onClose, onSaved}: {order?: OperatorOrder; customerMode?: 'edit' | 'request'; onClose: () => void; onSaved: (id: number) => void}) {
  const {t, lang} = useLanguage();
  const label = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  function command<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (customerMode && order) return accountApi.receiptCommand<T>(order.id,
      path === '/catalog' ? 'catalog' : path.endsWith('/quote') ? 'quote' : customerMode === 'request' ? 'request' : '', method, body);
    return foodOperations<T>(path, method, body);
  }
  const money = (value: number) => `${Number(value || 0).toLocaleString(getPublicLocale(lang), {maximumFractionDigits: 2})} ₸`;
  const [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [lines, setLines] = useState<Line[]>(() => {
    if (!order) return [];
    try { const parsed = JSON.parse(order.order_items); return Array.isArray(parsed) ? parsed.map((x, i) => ({...x, modifiers: x.modifiers || [], line_index: i})).filter(x => !x.is_gift) : []; } catch { return []; }
  });
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [address, setAddress] = useState('');
  const [cashGiven,setCashGiven] = useState('');
  const [apartment, setApartment] = useState('');
  const [entrance, setEntrance] = useState('');
  const [deliverToApartment, setDeliverToApartment] = useState(false);
  const [bonusUse,setBonusUse] = useState('');
  const [method, setMethod] = useState('delivery'), [payment, setPayment] = useState('cash'), [comment, setComment] = useState('');
  const [preorder,setPreorder]=useState(false), [schedule,setSchedule]=useState('');
  const [promoInput,setPromoInput]=useState(''), [promo,setPromo]=useState('');
  const [deliveryZone,setDeliveryZone] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [customDeliveryFee, setCustomDeliveryFee] = useState(false);
  const [reason, setReason] = useState(''), [search, setSearch] = useState(''), [category, setCategory] = useState<number | null>(null);
  const [quoteState, setQuoteState] = useState<{key: string; value: Quote} | null>(null), [busy, setBusy] = useState(false);
  const [calculating, setCalculating] = useState(false), [attempt, setAttempt] = useState(0);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [giftId, setGiftId] = useState(() => {try {return order ? JSON.parse(order.order_items).find((x: {is_gift?: boolean}) => x.is_gift)?.gift_id || '' : '';} catch {return '';}});
  const [customer, setCustomer] = useState<Customer | null>(null);
  useEffect(() => {setBonusUse('');}, [phone]);
  const lock = useRef(false), quoteGeneration = useRef(0);
  useEffect(() => { let alive = true; command<Catalog>('/catalog').then(x => {if (alive) {setCatalog(x); setError('');}}).catch(e => {if (alive) setError(e.message);}); return () => {alive = false;}; }, [catalogAttempt]);
  useEffect(() => {
    let alive = true; setCustomer(null);
    if (order || phone.replace(/\D/g, '').length < 10) return;
    const timer = setTimeout(() => { void foodOperations<Customer>(`/customer?phone=${encodeURIComponent(phone)}`).then(v => {if (alive) setCustomer(v);}).catch(() => { /* Optional CRM lookup must not block taking the call. */ }); }, 500);
    return () => {alive = false; clearTimeout(timer);};
  }, [phone, order]);
  const payload = useMemo(() => ({selected_gift_id: giftId || undefined, items: lines.map(x => ({line_index: x.line_index, id: typeof x.id === 'number' ? x.id : undefined, quantity: x.quantity, modifiers: x.modifiers || [], choices:x.choices || []})),
    ...(order ? {expected_version: order.version || 0, reason, ...(!customerMode && order.payment_method === 'cash' && cashGiven !== '' ? {cash_given_amount: Number(cashGiven)} : {})} : {request_key: requestKey, bonus_points_to_use:Number(bonusUse||0), promo_code:promo, scheduled_for:preorder?scheduleISO(schedule):undefined, customer_name: name.trim() || (method === 'dine_in' ? t('workflow.guest') : ''), customer_phone: phone, delivery_address: method === 'delivery' ? address : '', apartment: method === 'delivery' ? apartment.trim() : '', entrance: method === 'delivery' ? entrance.trim() : '', deliver_to_apartment: method === 'delivery' && deliverToApartment, delivery_method: method, delivery_zone_id: method === 'delivery' && catalog?.zone_tariffs_required ? deliveryZone || undefined : undefined, delivery_fee: method === 'delivery' && deliveryFee !== '' ? Number(deliveryFee) : undefined, payment_method: payment, cash_given_amount: payment === 'cash' && cashGiven !== '' ? Number(cashGiven) : undefined, comment})}), [lines, giftId, order, reason, requestKey, name, phone, address, apartment, entrance, deliverToApartment, method, deliveryFee, deliveryZone, catalog?.zone_tariffs_required, payment, cashGiven, comment, t, promo, preorder, schedule, bonusUse]);
  const key = JSON.stringify(payload);
  function configuredProduct(p:Product):MenuProduct {return p.modifier_groups ? p : {...p,modifier_groups:(catalog?.groups || []).filter(g=>catalog?.links.some(l=>l.food_item_id===p.id && l.modifier_group_id===g.id)).map(g=>({...g,type:g.max_select===1?'single':'multiple',options:(catalog?.options || []).filter(o=>o.group_id===g.id)})) as ModifierGroup[]};}
  const missing: string[] = [];
  if (!catalog) missing.push(label('Дождитесь загрузки меню.', 'Мәзірдің жүктелуін күтіңіз.'));
  if (!lines.length) missing.push(label('Добавьте блюда в заказ.', 'Тапсырысқа тағамдарды қосыңыз.'));
  if (preorder && !scheduleISO(schedule)) missing.push(label('Укажите дату и время предзаказа.', 'Алдын ала тапсырыстың күні мен уақытын көрсетіңіз.'));
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) missing.push(label('Количество должно быть от 1 до 99.', 'Саны 1 мен 99 аралығында болуы керек.'));
    if (line.line_index == null && catalog) {
      const product = catalog.products.find(p => p.id === line.id);
      if (!product) missing.push(label('Блюдо недоступно. Удалите его из заказа.', 'Тағам қолжетімсіз. Оны тапсырыстан алып тастаңыз.'));
      else missing.push(...selectionErrors(configuredProduct(product), {modifiers: line.modifiers, choices: line.choices || []}, (_, values) => `${product.name} · ${values[0]}: ${label('выберите от', 'таңдаңыз:')} ${values[1]}–${values[2]}`));
    }
  }
  if (order) {
    if (reason.trim().length < 3) missing.push(label('Укажите причину изменения (не менее 3 символов).', 'Өзгерту себебін көрсетіңіз (кемінде 3 таңба).'));
  } else {
    if (method !== 'dine_in') {
      if (!name.trim()) missing.push(label('Введите имя клиента или нажмите «Подставить данные».', 'Клиенттің атын енгізіңіз немесе деректерді толтырыңыз.'));
      if (phone.replace(/\D/g, '').length < 10) missing.push(label('Введите телефон клиента полностью.', 'Клиенттің телефон нөмірін толық енгізіңіз.'));
    }
    if (method === 'delivery') {
      if (deliverToApartment && !apartment.trim()) missing.push(label('Укажите квартиру для доставки до двери.', 'Есікке дейін жеткізу үшін пәтір нөмірін көрсетіңіз.'));
      if (!address.trim()) missing.push(label('Введите адрес доставки.', 'Жеткізу мекенжайын енгізіңіз.'));
      if (catalog?.zone_tariffs_required && !deliveryZone) missing.push(label('Выберите зону доставки.', 'Жеткізу аймағын таңдаңыз.'));
      if (deliveryFee === '' || !Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0 || Number(deliveryFee) > 50_000) missing.push(label('Укажите стоимость доставки от 0 до 50 000 ₸.', 'Жеткізу бағасын 0–50 000 ₸ аралығында көрсетіңіз.'));
    }
  }
  const ready = missing.length === 0;
  const quote = quoteState?.key === key ? quoteState.value : null;
  const path = order ? `/orders/${order.id}/receipt` : '/manual';
  useEffect(() => {
    const gen = ++quoteGeneration.current;
    setError('');
    if (!ready) {setCalculating(false); return;}
    setCalculating(true);
    const timer = setTimeout(() => { void command<Quote>(path + '/quote', 'POST', JSON.parse(key)).then(value => {
      if (gen === quoteGeneration.current) setQuoteState({key, value});
    }).catch(e => {if (gen === quoteGeneration.current) {setQuoteState(null); setError(e.message);}}).finally(() => {if (gen === quoteGeneration.current) setCalculating(false);}); }, 350);
    return () => {clearTimeout(timer); quoteGeneration.current++;};
  }, [key, ready, path, attempt]);
  const groupsFor = (id?: number) => catalog?.groups.filter(g => catalog.links.some(l => l.food_item_id === id && l.modifier_group_id === g.id)) || [];
  function add(product: Product, separate = false) {
    const existing = lines.findIndex(x => x.id === product.id && x.line_index == null);
    if (existing >= 0 && !separate) {setLines(lines.map((x, i) => i === existing ? {...x, quantity: Math.min(99, x.quantity + 1)} : x)); return;}
    const defaults = groupsFor(product.id).flatMap(g => (catalog?.options.filter(o => o.group_id === g.id) || []).slice(0, Math.max(g.min_select || 0, g.is_required ? 1 : 0)).map(o => ({option_id: o.id})));
    setLines([...lines, {id: product.id, name: product.name, quantity: 1, modifiers: defaults, choices:[]}]);
  }
  function quantity(index: number, next: number) {if (Number.isInteger(next) && next >= 1 && next <= 99) setLines(lines.map((x, i) => i === index ? {...x, quantity: next} : x));}
  const unit = (line: Line) => line.line_index != null ? Number(line.price || 0) + Number(line.modTotal || 0) : estimateSelection(configuredProduct(catalog!.products.find(p=>p.id===line.id)!),{modifiers:line.modifiers,choices:line.choices || []});
  const draftSubtotal = lines.reduce((sum, line) => sum + unit(line) * line.quantity, 0);
  async function save() {
    if (lock.current || !ready || !quote || calculating || quote.gift_required) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await command<OperatorOrder>(path, 'POST', {...payload, quoted_total: quote.total_amount});
      toast.success(customerMode === 'request' ? label('Запрос отправлен. Заказ пока не изменён.', 'Өтініш жіберілді. Тапсырыс әлі өзгерген жоқ.') : `${t('workflow.saved')} №${order?.id || result.id}`); onSaved(order?.id || result.id);
    } catch (e) {setError((e as Error).message);}
    finally {lock.current = false; setBusy(false);}
  }
  const products = catalog?.products.filter(x => (category == null || x.category_id === category) && x.name.toLowerCase().includes(search.toLowerCase())) || [];
  const categories = (catalog?.categories || []).filter(c => catalog?.products.some(p => p.category_id === c.id));
  const actions = <>
        <Button className="w-full h-auto min-h-14 text-base whitespace-normal" disabled={busy || !ready || calculating || !quote || !!quote.gift_required} onClick={() => void save()}>{busy ? t('workflow.loading') : `${customerMode === 'request' ? label('Отправить запрос оператору', 'Операторға өтініш жіберу') : t(order ? 'workflow.confirm' : 'pos.create')}${quote ? ` — ${money(quote.total_amount)}` : ''}`}</Button>
        <Button className="w-full" variant="outline" disabled={busy} onClick={onClose}>{t('workflow.cancel')}</Button>
  </>;
  return <Dialog open onOpenChange={open => {if (!open && !busy) onClose();}}><DialogContent className={`dam-mobile-dialog w-[calc(100%-1rem)] max-w-7xl max-h-[95dvh] overflow-y-auto p-4 sm:p-6 ${!customerMode ? 'dam-operator-receipt' : ''}`}><DialogHeader><DialogTitle>{customerMode === 'request' ? label('Запросить изменение заказа', 'Тапсырысты өзгертуге өтініш') : t(order ? 'workflow.edit' : 'workflow.manual')}</DialogTitle></DialogHeader>
    {customerMode && <p className="text-sm text-muted-foreground">{customerMode === 'request' ? label('Предложите новый состав оператору. Действующий заказ и оплата останутся прежними до согласования.', 'Операторға жаңа құрамды ұсыныңыз. Келісілгенге дейін тапсырыс пен төлем өзгермейді.') : label('Изменить состав можно до принятия заказа оператором. Проверьте новую сумму перед сохранением.', 'Тапсырыс оператор қабылдағанға дейін өзгертіледі. Сақтамас бұрын жаңа соманы тексеріңіз.')}</p>}
    <div className={!customerMode ? "dam-operator-receipt-body" : undefined}><fieldset disabled={busy} className="min-w-0 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
      <section className="min-w-0 space-y-4">
        {!order && <div className="grid sm:grid-cols-2 gap-3 rounded-xl border p-4">
          <label>{t(method === 'dine_in' ? 'workflow.optionalPhone' : 'workflow.phone')}<Input type="tel" value={phone} maxLength={32} onChange={e => setPhone(e.target.value)} /></label>
          <label>{t('workflow.name')}<Input value={name} maxLength={150} onChange={e => setName(e.target.value)} /></label>
<CRMSearch query={phone.replace(/\D/g,'').length>=3?phone:name} onSelect={c=>{setName(c.name);setPhone(c.phone);}}/>
          {customer?.loyalty && <label className="sm:col-span-2 rounded-xl border p-3 text-sm">Бонусы клиента: {customer.loyalty.balance} ₸ · до {customer.loyalty.rules.max_spend_percent}% еды после скидок
        <input aria-label="Списать бонусы" className="mt-2 w-full rounded-lg border bg-background p-2" type="number" min="0" step="1" value={bonusUse} onChange={e=>setBonusUse(e.target.value)}/>
        <span className="text-xs text-muted-foreground">Окончательную допустимую сумму проверяет сервер.</span></label>}
      {customer?.name && <div className="sm:col-span-2 text-sm rounded-lg bg-muted p-3"><Button type="button" variant="outline" onClick={() => {setName(customer.name); if (customer.addresses[0]) setAddress(customer.addresses[0]);}}>{t('pos.useCustomer')} · {customer.name}</Button><p className="mt-2">{t('pos.recentOrders')}: {customer.recent_orders.map(o => `№${o.id} · ${money(o.amount)}`).join('; ')}</p>{customer.addresses.length > 1 && <select aria-label={t('workflow.address')} value={address} className="w-full mt-2 rounded-lg border bg-background p-2" onChange={e => setAddress(e.target.value)}><option value="">{t('workflow.address')}</option>{customer.addresses.map(a => <option key={a}>{a}</option>)}</select>}</div>}
          <label>{t('workflow.method')}<select className="w-full border rounded-lg p-3 bg-background" value={method} onChange={e => setMethod(e.target.value)}><option value="delivery">{t('workflow.delivery')}</option><option value="pickup">{t('workflow.pickup')}</option><option value="dine_in">{t('workflow.onsite')}</option></select></label>
          {payment === 'cash' && <CashAmount total={quoteState?.value.total_amount || 0} value={cashGiven} onChange={setCashGiven}/>}
          <label>{t('workflow.payment')}<select className="w-full border rounded-lg p-3 bg-background" value={payment} onChange={e => setPayment(e.target.value)}><option value="cash">{t('workflow.cash')}</option><option value="kaspi_qr">Kaspi</option><option value="halyk_qr">Halyk</option></select></label>
          {payment !== 'cash' && <p className="sm:col-span-2 text-sm text-muted-foreground">{label('Выбор банка не означает оплату. После фактического получения денег оператор отдельно подтверждает оплату заказа.', 'Банкті таңдау төлем жасалды дегенді білдірмейді. Ақша нақты түскеннен кейін оператор тапсырыстың төлемін бөлек растайды.')}</p>}
          {method === 'delivery' && <>
            <label className="sm:col-span-2">{t('workflow.address')}<Input value={address} maxLength={1000} onChange={e => setAddress(e.target.value)} /></label>
            <label>{label('Квартира / офис', 'Пәтір / кеңсе')}<Input value={apartment} maxLength={50} placeholder={label('Например: 24', 'Мысалы: 24')} onChange={e => setApartment(e.target.value)} /></label>
            <label>{label('Подъезд (необязательно)', 'Кіреберіс (міндетті емес)')}<Input value={entrance} maxLength={50} placeholder={label('Например: 2', 'Мысалы: 2')} onChange={e => setEntrance(e.target.value)} /></label>
            <label className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={deliverToApartment} onChange={e => setDeliverToApartment(e.target.checked)} /><span>{label('Доставка до квартиры', 'Пәтірге дейін жеткізу')}</span></label>
            <p className="sm:col-span-2 text-sm text-muted-foreground">{label('Доплата до квартиры рассчитывается по настройкам владельца и входит в сумму доставки в чеке. Номер квартиры можно указать и без подъёма до двери.', 'Пәтірге дейін жеткізу ақысы иесінің баптауы бойынша есептеліп, чектегі жеткізу сомасына кіреді. Пәтір нөмірін есікке дейін жеткізусіз де көрсетуге болады.')}</p>
            {catalog?.zone_tariffs_required ? <label>Зона доставки<select className="w-full border rounded-lg p-3 bg-background" value={deliveryZone} onChange={e=>{setDeliveryZone(e.target.value);const zone=catalog.delivery_options?.find(z=>z.id===e.target.value);setDeliveryFee(zone?String(zone.price):'');setCustomDeliveryFee(false);}}><option value="">Выберите зону</option>{(catalog.delivery_options || []).map(zone=><option key={zone.id} value={zone.id}>{zone.name} — клиент {money(zone.price)} · {zone.courier_payout==null?'выплату должен задать владелец':`курьер ${money(zone.courier_payout)}`}</option>)}</select></label> : <label>{t('dam.pos.deliveryFee')}<select className="w-full border rounded-lg p-3 bg-background" value={customDeliveryFee ? 'custom' : deliveryFee} onChange={e => {const value = e.target.value; setCustomDeliveryFee(value === 'custom'); setDeliveryFee(value === 'custom' ? '' : value);}}><option value="">{t('dam.pos.chooseDeliveryFee')}</option>{(catalog?.delivery_options || []).map(option => <option key={option.id} value={option.price}>{option.name} — {money(option.price)}</option>)}<option value="custom">{t('dam.pos.customDeliveryFee')}</option></select></label>}
            {customDeliveryFee && <label>{t('dam.pos.deliveryAmount')}<Input type="number" inputMode="numeric" min={0} max={50000} step={100} value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} /></label>}
            <p className="sm:col-span-2 text-sm text-muted-foreground">{t('dam.pos.deliveryFeeHelp')}</p>
          </>}
<div className="sm:col-span-2"><PreorderFields enabled={preorder} value={schedule} onEnabled={setPreorder} onChange={setSchedule}/></div>
          <label className="sm:col-span-2">{t('workflow.comment')}<Input value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} /></label>
        </div>}
        <label className="block">{t('workflow.search')}<Input value={search} onChange={e => setSearch(e.target.value)} /></label>
        <nav aria-label={t('pos.categories')} className="flex flex-wrap gap-2"><Button variant={category == null ? 'default' : 'outline'} onClick={() => setCategory(null)}>{t('pos.all')}</Button>{categories.map(c => <Button key={c.id} variant={category === c.id ? 'default' : 'outline'} onClick={() => setCategory(c.id)}>{c.name}</Button>)}</nav>
        {!catalog && <Button variant="outline" onClick={() => setCatalogAttempt(v => v + 1)}>{t('pos.reloadMenu')}</Button>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[45dvh] overflow-y-auto lg:max-h-[55dvh] p-1">{products.map(x => {
          const count = lines.filter(l => l.id === x.id).reduce((sum, l) => sum + l.quantity, 0);
          return <button type="button" key={x.id} onClick={() => add(x)} className={`min-h-28 rounded-xl border p-4 text-left flex flex-col justify-between gap-3 transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring ${count ? 'border-primary bg-primary/10' : 'bg-card'}`}><strong className="break-words">{x.name}</strong><span className="flex flex-wrap justify-between gap-2"><span>{money(x.price)}</span><span className="font-bold">{count ? `× ${count}` : '+'}</span></span></button>;
        })}</div>{catalog && !products.length && <p className="text-muted-foreground">{t('pos.noProducts')}</p>}
      </section>
      <aside className="min-w-0 rounded-2xl border bg-card p-4 space-y-4 lg:sticky lg:top-0 self-start">
        <h3 className="text-lg font-bold">{t('pos.basket')}</h3>
        {!order && <div className="space-y-2"><label>Промокод<Input value={promoInput} maxLength={80} onChange={e=>{setPromoInput(e.target.value);if(promo)setPromo('');}}/></label><Button variant="outline" disabled={!promoInput.trim()} onClick={()=>setPromo(promoInput.trim().toUpperCase())}>Применить</Button>{promo&&<Button variant="ghost" onClick={()=>{setPromo('');setPromoInput('');}}>Убрать промокод</Button>}{quote?.promo_code&&<p className="text-sm text-emerald-700">✓ Промокод {quote.promo_code} применён</p>}</div>}
        {!lines.length && <p className="text-muted-foreground py-6">{t('pos.empty')}</p>}
        <div className="divide-y lg:max-h-[40dvh] lg:overflow-y-auto">{lines.map((line, i) => <div key={i} className="py-3 space-y-2">
          <div className="flex justify-between gap-3"><strong className="break-words">{line.name}</strong><strong className="shrink-0">{money(unit(line) * line.quantity)}</strong></div>
          <div className="flex flex-wrap gap-2 items-center"><span className="text-sm text-muted-foreground flex-1">{money(unit(line))}</span><Button aria-label={`${t('pos.less')} ${line.name}`} variant="outline" className="h-11 w-11 p-0" disabled={line.quantity <= 1} onClick={() => quantity(i, line.quantity - 1)}>−</Button><Input aria-label={`${t('workflow.quantity')} ${line.name}`} type="number" min={1} max={99} className="w-16 text-center h-11" value={line.quantity} onChange={e => quantity(i, Number(e.target.value))} /><Button aria-label={`${t('pos.more')} ${line.name}`} variant="outline" className="h-11 w-11 p-0" disabled={line.quantity >= 99} onClick={() => quantity(i, line.quantity + 1)}>+</Button><Button variant="ghost" onClick={() => setLines(lines.filter((_,j) => i !== j))}>{t('workflow.remove')}</Button></div>
          {line.line_index != null && line.modifiers.length > 0 && <p className="text-sm text-muted-foreground">{line.modifiers.map(m => m.name).filter(Boolean).join(', ')}</p>}
          {line.line_index == null && catalog?.products.find(p=>p.id===line.id) && <MenuSelectionFields product={configuredProduct(catalog.products.find(p=>p.id===line.id)!)} value={{modifiers:line.modifiers,choices:line.choices || []}} onChange={value=>setLines(lines.map((x,j)=>j===i?{...x,...value}:x))}/>}
          {line.line_index == null && groupsFor(line.id).length > 0 && <Button variant="outline" size="sm" onClick={() => {const product = catalog?.products.find(p => p.id === line.id); if (product) add(product, true);}}>{t('pos.variant')}</Button>}
        </div>)}</div>
        {order && <label className="block">{customerMode ? customerMode === 'request' ? label('Комментарий оператору', 'Операторға түсініктеме') : label('Причина изменения', 'Өзгерту себебі') : t('workflow.reason')}<Input value={reason} maxLength={500} placeholder={customerMode ? label('Например: хочу добавить напиток', 'Мысалы: сусын қосқым келеді') : t('workflow.reasonHint')} onChange={e => setReason(e.target.value)} /></label>}
        {!!quote?.gift_choices?.length && <label className="block">{t('workflow.gift')}<select className="w-full border rounded-lg p-3 bg-background" value={quote.gift_choices.some(g => g.id === giftId) ? giftId : quote.gift_choices.length === 1 ? quote.gift_choices[0].id : ''} onChange={e => setGiftId(e.target.value)}><option value="">{t('workflow.chooseGift')}</option>{quote.gift_choices.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>}
        <div aria-live="polite" className="border-t pt-3 space-y-2"><p className="flex justify-between"><span>{t('pos.subtotal')}</span><span>{money(quote?.subtotal ?? draftSubtotal)}</span></p>
          {quote && <>{quote.delivery_fee != null && <p className="flex justify-between"><span>{t('workflow.delivery')}</span><span>{money(quote.delivery_fee)}</span></p>}{!!quote.service_fee && <p className="flex justify-between"><span>{t('pos.service')}</span><span>{money(quote.service_fee)}</span></p>}{!!quote.discount && <p className="flex justify-between"><span>{t('pos.discount')}</span><span>−{money(quote.discount)}</span></p>}{quote.adjustment != null && <p className="flex justify-between"><span>{t('pos.adjustment')}</span><span>{money(quote.adjustment)}</span></p>}<p className="text-xl font-bold flex justify-between"><span>{t('workflow.total')}</span><span>{money(quote.total_amount)}</span></p>{quote.paid_amount != null && <p>{t('workflow.received')}: {money(quote.paid_amount)}</p>}{!!quote.amount_due && <p>{t('workflow.due')}: {money(quote.amount_due)}</p>}{!!quote.refund_due && <p>{t('workflow.refund')}: {money(quote.refund_due)}</p>}</>}
          {!ready && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">{label('Чтобы создать или сохранить заказ:', 'Тапсырысты жасау немесе сақтау үшін:')}</p><ul className="mt-2 list-disc space-y-1 pl-5">{[...new Set(missing)].map(message => <li key={message}>{message}</li>)}</ul></div>}{calculating && <p role="status">{t('pos.calculating')}</p>}
        </div>
        {error && <div role="alert" className="rounded-xl bg-destructive/10 text-destructive p-3"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(v => v + 1)}>{t('pos.retry')}</Button></div>}
        {quote?.delivery_tariff && <div className="rounded-xl border p-3 text-sm"><p>Зона: {quote.delivery_tariff.zone_name}</p><p>Клиент платит за доставку: {money(quote.delivery_fee || 0)}</p><p>Курьер получит всего: {quote.delivery_tariff.courier_payout==null?'не настроено — обратитесь к владельцу':money(quote.delivery_tariff.courier_payout)}</p>{quote.delivery_tariff.courier_payout!=null && <p>Доплата бизнеса: {money(Math.max(0,quote.delivery_tariff.courier_payout-(quote.delivery_fee || 0)))}</p>}</div>}
        {order?.payment_method === 'cash' && !customerMode && <label className="block rounded-xl border p-3 text-sm space-y-2"><span>Новая сумма наличных, согласованная с клиентом</span><Input type="number" min="0" max="100000000" step="0.01" value={cashGiven} onChange={e => setCashGiven(e.target.value)} placeholder="Оставить прежнюю договорённость"/><p className="text-muted-foreground">Оставьте поле пустым, чтобы сохранить прежнюю сумму. Если её недостаточно, состав сохранится, а сдачу нужно будет уточнить с клиентом.</p>{quote && cashGiven === '' && order.cash_given_amount != null && order.cash_given_amount !== order.total_amount && order.cash_given_amount < quote.total_amount && <p className="font-medium text-amber-700">Прежние {money(order.cash_given_amount)} меньше новой суммы. Уточните наличные у клиента.</p>}</label>}
        {customerMode && actions}
      </aside>
    </fieldset></div>
    {!customerMode && <footer className="dam-operator-receipt-footer" aria-label={label('Сохранение заказа', 'Тапсырысты сақтау')}>
      {(!ready || calculating || error || quote?.gift_required) && <p className="text-sm text-muted-foreground" role="status">{error || (!ready ? missing[0] : calculating ? t('pos.calculating') : t('workflow.chooseGift'))}</p>}
      <div className="dam-operator-receipt-actions">{actions}</div>
    </footer>}
  </DialogContent></Dialog>;
}
