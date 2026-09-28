import {useEffect, useId, useState} from 'react';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import DamAlemImage from './DamAlemImage';
import {activeGroups, emptySelection, estimateSelection, menuMoney, quoteMenuLine, selectionErrors, type MenuProduct, type MenuSelection, type LineSnapshot} from '@/lib/damMenu';

export function MenuSelectionFields({product, value, onChange}: {product: MenuProduct; value: MenuSelection; onChange: (s: MenuSelection)=>void}) {
  const instance=useId();
  function modifier(gid: number, oid: number, quantity: number) {
    const group = activeGroups(product).find(g=>g.id===gid)!;
    let others = value.modifiers.filter(m=>m.option_id!==oid);
    if (quantity && group.max_select===1) others = others.filter(m=>!group.options.some(o=>o.id===m.option_id));
    onChange({...value, modifiers: [...others, ...(quantity ? [{option_id: oid, quantity}] : [])]});
  }
  return <div className="space-y-5">
    {!!product.combo?.components.length && <div className="rounded-xl bg-muted p-3"><p className="font-semibold">В составе</p><ul className="mt-2 space-y-1 text-sm">{product.combo.components.map(p=><li key={p.item_id}>{p.name} ×{p.quantity}</li>)}</ul></div>}
    {(product.combo?.groups || []).map(g=><fieldset key={g.id} className="space-y-2"><legend className="font-semibold">{g.name} <span className="text-xs font-normal text-muted-foreground">{g.min_select ? 'Обязательно' : 'По желанию'} · до {g.max_select}</span></legend>{g.options.filter(o=>o.available!==false).map(o=>{
      const checked = value.choices.some(c=>c.group_id===g.id && c.item_id===o.item_id);
      const count = value.choices.filter(c=>c.group_id===g.id).length;
      return <label key={o.item_id} className="flex min-h-12 items-center gap-3 rounded-xl border p-3"><input type={g.max_select===1 && g.min_select>0 ? 'radio':'checkbox'} name={`combo-${instance}-${g.id}`} checked={checked} disabled={!checked && g.max_select>1 && count>=g.max_select} onChange={()=>onChange({...value, choices: checked && (g.max_select!==1 || g.min_select===0) ? value.choices.filter(c=>!(c.group_id===g.id && c.item_id===o.item_id)) : [...value.choices.filter(c=>g.max_select!==1 || c.group_id!==g.id), {group_id:g.id,item_id:o.item_id}]})}/><span className="flex-1">{o.name}{o.quantity>1 ? ` ×${o.quantity}`:''}</span><span className="text-sm">+{menuMoney(Number(o.surcharge || 0))}</span></label>;
    })}</fieldset>)}
    {activeGroups(product).map(g=><fieldset key={g.id} className="space-y-2"><legend className="font-semibold">{g.name} <span className="text-xs font-normal text-muted-foreground">{g.is_required || g.min_select ? 'Обязательно':'По желанию'} · до {g.max_select}</span></legend>{g.options.filter(o=>o.is_active!==false && !o.archived_at).map(o=>{
      const count = value.modifiers.find(m=>m.option_id===o.id)?.quantity || (value.modifiers.some(m=>m.option_id===o.id)?1:0);
      const total = value.modifiers.filter(m=>g.options.some(x=>x.id===m.option_id)).reduce((a,m)=>a+(m.quantity || 1),0);
      return <div key={o.id} className="flex min-h-12 flex-wrap items-center gap-3 rounded-xl border p-3"><label className="flex flex-1 items-center gap-3"><input type={g.max_select===1 && (g.is_required || g.min_select>0) ? 'radio':'checkbox'} name={`modifier-${instance}-${g.id}`} checked={count>0} disabled={!count && g.max_select>1 && total>=g.max_select} onChange={e=>modifier(g.id,o.id,e.target.checked?1:0)}/><span>{o.name}</span></label><span className="text-sm">+{menuMoney(Number(o.price))}</span>{g.type==='quantity' && count>0 && <div className="flex items-center gap-2"><Button type="button" size="icon" variant="outline" aria-label={`Уменьшить ${o.name}`} onClick={()=>modifier(g.id,o.id,count-1)}>−</Button><span aria-label={`Количество ${o.name}`}>{count}</span><Button type="button" size="icon" variant="outline" aria-label={`Увеличить ${o.name}`} disabled={total>=g.max_select} onClick={()=>modifier(g.id,o.id,count+1)}>+</Button></div>}</div>;
    })}</fieldset>)}
  </div>;
}

export default function MenuSelectionDialog({product, initial, initialQuantity=1, preview=false, confirmLabel='Добавить в корзину', onClose, onConfirm}: {product:MenuProduct; initial?:MenuSelection; initialQuantity?:number; preview?:boolean; confirmLabel?:string; onClose:()=>void; onConfirm?:(selection:MenuSelection,quantity:number,snapshot:LineSnapshot)=>void}) {
  const [selection,setSelection]=useState<MenuSelection>(initial || emptySelection());
  const [quantity,setQuantity]=useState(initialQuantity);
  const [quote,setQuote]=useState<{key:string;row:LineSnapshot}|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const key=JSON.stringify({selection,quantity,version:product.menu_version});
  const errors=selectionErrors(product,selection);
  const valid=!errors.length && product.sellable!==false;
  useEffect(()=>{
    let alive=true;
    setError('');
    if(!valid || preview) return;
    const timer=setTimeout(()=>void quoteMenuLine(product,selection,quantity).then(row=>{if(alive)setQuote({key,row});}).catch(e=>{if(alive)setError(e.message);}),180);
    return ()=>{alive=false;clearTimeout(timer);};
  },[key, valid, preview, retry, product.id]);
  const current=quote?.key===key ? quote.row:null;
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="w-[calc(100%-1rem)] max-w-xl max-h-[92dvh] flex flex-col overflow-hidden p-0"><DialogHeader className="px-5 pt-5 pr-12"><DialogTitle>{product.name}</DialogTitle><DialogDescription>{preview?'Предпросмотр карточки клиента':product.description || 'Выберите состав и количество'}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto px-5 pb-5 space-y-5">{product.image_url && <DamAlemImage src={product.image_url} alt={product.name} className="h-40 w-full rounded-xl object-cover"/>}<p className="font-bold">{menuMoney(product.price)}</p><MenuSelectionFields product={product} value={selection} onChange={setSelection}/><div className="flex items-center justify-between"><span>Количество</span><div className="flex items-center gap-4"><Button variant="outline" size="icon" aria-label="Уменьшить количество" disabled={quantity<=1} onClick={()=>setQuantity(q=>q-1)}>−</Button><span>{quantity}</span><Button variant="outline" size="icon" aria-label="Увеличить количество" disabled={quantity>=99} onClick={()=>setQuantity(q=>q+1)}>+</Button></div></div>{errors.map(x=><p key={x} className="text-sm text-amber-700">{x}</p>)}{product.unavailable_reasons?.map(x=><p key={x} role="alert">{x}</p>)}{error && <div role="alert" className="text-sm text-red-600">{error}<Button variant="link" onClick={()=>setRetry(x=>x+1)}>Повторить расчёт</Button></div>}</div><div className="border-t bg-background p-4"><Button data-testid="dam-product-add" className="min-h-12 w-full whitespace-normal" disabled={!preview && (!valid || !current || !!error)} onClick={()=>preview?onClose():current&&onConfirm?.(selection,quantity,current)}>{preview?`Закрыть предпросмотр — ${menuMoney(estimateSelection(product,selection)*quantity)}`:current?`${confirmLabel} — ${menuMoney(current.sum)}`:'Проверяем состав и цену…'}</Button></div></DialogContent></Dialog>;
}
