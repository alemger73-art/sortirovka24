"""Owner-authorized workstation; a workstation token cannot call partner APIs."""
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.auth import create_access_token, decode_access_token
from core.database import get_db
from core.food_staff_guard import food_owner
from models.partner_auth import PartnerCredentials
from routers.partner_auth import _create_partner_jwt
from services.food_shifts import active_shift, open_shift, shift_view
from utils.courier_pin import verify_courier_pin
from utils.rate_limit import check_keyed_rate_limit

router=APIRouter(prefix='/api/v1/dam-alem/workstation',tags=['DAM workstation'])
def version(row): return hashlib.sha256(row.password_hash.encode()).hexdigest()[:24]

@router.post('/authorize')
async def authorize(db:AsyncSession=Depends(get_db),claims=Depends(food_owner)):
    owner=await db.get(PartnerCredentials,claims.get('staff_id')) if claims.get('staff_id') else None
    if not owner: raise HTTPException(403,'Подключите рабочее место под личной учётной записью владельца')
    token=create_access_token({'type':'dam_workstation','owner_id':owner.id,'password_version':version(owner),'device_id':secrets.token_hex(16)},expires_minutes=30*24*60)
    return {'device_token':token,'expires_days':30}

class Entry(BaseModel):
    pin:str=Field(pattern=r'^\d{4}$')

@router.post('/enter')
async def enter(body:Entry,request:Request,db:AsyncSession=Depends(get_db)):
    try:
        scheme,token=request.headers.get('authorization','').split(' ',1)
        if scheme.lower()!='bearer': raise ValueError()
        claims=decode_access_token(token)
        if claims.get('type')!='dam_workstation': raise ValueError()
        owner=await db.get(PartnerCredentials,int(claims['owner_id']))
        if not owner or not owner.is_active or owner.partner_type!='dam_alem' or (owner.access_role or 'owner')!='owner' or version(owner)!=claims.get('password_version'): raise ValueError()
    except Exception:
        raise HTTPException(401,'Рабочее место нужно снова подключить владельцу') from None
    check_keyed_rate_limit('dam-workstation:'+claims['device_id'],window_seconds=900,max_hits=20,message='Слишком много попыток. Повторите через 15 минут.')
    rows=(await db.scalars(select(PartnerCredentials).where(PartnerCredentials.partner_type=='dam_alem',PartnerCredentials.is_active==True,PartnerCredentials.access_role=='operator',PartnerCredentials.pin_hash.isnot(None)))).all()
    matches=[r for r in rows if verify_courier_pin(r.pin_hash,body.pin)]
    if not matches: raise HTTPException(403,'Неверный PIN или оператор отключён')
    if len(matches)!=1: raise HTTPException(409,'У сотрудников совпадают PIN. Владелец должен назначить разные PIN.')
    row=matches[0]
    shift=await active_shift(db,'partner',row.id)
    resumed=bool(shift)
    if not shift:
        try:
            shift=await open_shift(db,staff_type='partner',staff_id=row.id,staff_name=row.display_name or row.email,role='operator',stored_pin=row.pin_hash,pin=body.pin)
        except HTTPException as exc:
            if exc.status_code!=409: raise
            shift=await active_shift(db,'partner',row.id)
            if not shift: raise
            resumed=True
    return {'token':_create_partner_jwt(row.id,'dam_alem',row.email or row.phone,row.display_name or row.email),'name':row.display_name or row.email,'shift':shift_view(shift),'resumed':resumed}
