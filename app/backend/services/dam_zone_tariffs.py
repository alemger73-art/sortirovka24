"""Explicit delivery-zone tariffs, saved in existing order pricing snapshots."""
import json
from decimal import Decimal, InvalidOperation
from fastapi import HTTPException
from services.gastronom_delivery import parse_delivery_zones

def amount(value, label):
    try:
        result=Decimal(str(value))
        if not result.is_finite() or not 0<=result<=50000 or result.as_tuple().exponent < -2:raise ValueError()
    except (InvalidOperation,ValueError,TypeError):
        raise HTTPException(409,f'{label} не настроен или некорректен. Владелец должен заполнить тариф зоны.') from None
    return float(result)

def zone_tariff(settings, zone_id, *, require_payout=True):
    matches=[z for z in parse_delivery_zones(settings) if z['id']==zone_id]
    if len(matches)!=1:raise HTTPException(409,'Выберите действующую зону доставки; идентификаторы зон должны быть уникальны.')
    zone=matches[0]
    raw=settings.get('delivery_zones') or '[]'
    raw=json.loads(raw) if isinstance(raw,str) else raw
    original=next(z for i,z in enumerate(raw) if str(z.get('id') or f'zone-{i+1}')==zone_id)
    return {'zone_id':zone['id'],'zone_name':zone['name'],
        'customer_fee':amount(original.get('price'),'Цена доставки клиенту'),
        'courier_payout':None if not require_payout and zone.get('courier_payout') in (None,'') else amount(zone.get('courier_payout'),'Вознаграждение курьеру')}

def saved_tariff(order):
    try:return json.loads(order.pricing_snapshot or '{}').get('delivery_tariff')
    except (TypeError,ValueError):return None
