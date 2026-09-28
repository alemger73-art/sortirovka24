"""Scheduling and pickup reuse food_settings, existing media storage and order lifecycle."""
import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict, model_validator
from sqlalchemy import select
from core.database import get_db
from core.food_staff_guard import food_owner
from models.food_settings import Food_settings
from services.food_preorders import schedule_settings, available_slots, pickup_view, lock_dam_operations
from services.loyalty import audit
router = APIRouter(prefix='/api/v1/dam-alem/checkout-config', tags=['dam-checkout'])

class Pickup(BaseModel):
    model_config = ConfigDict(extra='forbid')
    display_name: str = Field('DÄM ALEM 2.0', min_length=1, max_length=150)
    address: str = Field('Парк Железнодорожников', min_length=1, max_length=250)
    instructions: str = Field('Ориентир: бывший фонтан', max_length=500)
    photo: str = Field('', max_length=1000)
    supports_pickup: bool = True
    supports_delivery: bool = True
    latitude: float | None = Field(None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(None, ge=-180, le=180, allow_inf_nan=False)
    @model_validator(mode='after')
    def complete(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError('Укажите обе координаты')
        if self.photo and (not (self.photo.startswith('https://') or (self.photo.startswith('/') and not self.photo.startswith('//'))) or '..' in self.photo):
            raise ValueError('Нужна фотография из хранилища или HTTPS')
        return self

class Configuration(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool
    min_minutes: int = Field(ge=0, le=1440)
    advance_days: int = Field(ge=1, le=30)
    step_minutes: int = Field(ge=5, le=120)
    prepare_minutes: int = Field(ge=0, le=1440)
    pickup: Pickup
    closed_dates: list[date] = Field(default_factory=list, max_length=100)

@router.get('')
async def view(db=Depends(get_db)):
    settings = await schedule_settings(db)
    from services.crm import pickup_location
    return {**available_slots(settings), 'pickup': await pickup_location(db), 'working_hours': settings.get('working_hours','')}

@router.put('')
async def save(body: Configuration, claims=Depends(food_owner), db=Depends(get_db)):
    await lock_dam_operations(db)
    settings = await schedule_settings(db)
    changes = {'preorders_enabled':'1' if body.enabled else '0', 'preorder_min_minutes':str(body.min_minutes),
        'preorder_advance_days':str(body.advance_days),'preorder_step_minutes':str(body.step_minutes),
        'preorder_lead_minutes':str(body.prepare_minutes), 'preorder_closed_dates':json.dumps(sorted({x.isoformat() for x in body.closed_dates}))}
    for key, value in changes.items():
        rows = (await db.scalars(select(Food_settings).where(Food_settings.setting_key == key))).all()
        if not rows:
            db.add(Food_settings(setting_key=key,setting_value=value,is_active=True))
        for row in rows:
            row.setting_value=value
    from services.crm import ensure_business, DAM, pickup_location
    from models.crm import BusinessLocation
    await ensure_business(db)
    old_location=await pickup_location(db)
    row=await db.scalar(select(BusinessLocation).where(BusinessLocation.business_id==DAM).order_by(BusinessLocation.id))
    if not row:
        row=BusinessLocation(id='dam_alem:main', business_id=DAM)
        db.add(row)
    values=body.pickup
    row.name,row.address,row.landmark,row.photo=values.display_name,values.address,values.instructions,values.photo
    row.latitude,row.longitude=values.latitude,values.longitude
    row.supports_pickup,row.supports_delivery,row.active=values.supports_pickup,values.supports_delivery,True
    audit(db,'business_location_changed', {'id':str(claims.get('staff_id') or claims.get('sub')),'role':'owner'},
        'business_locations',row.id,{'business_id':DAM,'old':old_location,'new':values.model_dump()})
    audit(db, 'checkout_configuration_changed', {'id':str(claims.get('staff_id') or claims.get('sub')),'role':'owner'},
        'food_settings','checkout', {'old':{k:settings.get(k) for k in changes},'new':changes})
    await db.commit()
    return await view(db)
