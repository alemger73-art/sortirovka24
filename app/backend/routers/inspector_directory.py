"""Public police directory and administrator-maintained department information."""
import json
from datetime import date
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.admin_guard import require_panel_admin
from models.inspector_directory import InspectorDirectory
from services.module_settings import require_module

router = APIRouter(prefix='/api/v1/inspector-directory', tags=['inspector-directory'], dependencies=[Depends(require_module('inspectors'))])

class Tip(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=1800)
    source_url: str = Field(default='', max_length=1000)

    @field_validator('source_url')
    @classmethod
    def safe_url(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
                raise ValueError('Ссылка должна начинаться с https://')
        return value

class DirectoryData(BaseModel):
    revision: int = Field(default=0, ge=0)
    department_name: str = Field(default='', max_length=180)
    address: str = Field(default='', max_length=500)
    duty_phone: str = Field(default='', max_length=40)
    duty_whatsapp: str = Field(default='', max_length=40)
    map_url: str = Field(default='', max_length=1000)
    reception_schedule: str = Field(default='', max_length=500)
    source_url: str = Field(default='', max_length=1000)
    verified_on: date | None = None
    notice: str = Field(default='', max_length=1000)
    tips: list[Tip] = Field(default_factory=lambda: [Tip(
        title='Статья 505: благоустройство территории',
        body='Статья 505 КоАП РК касается нарушений правил благоустройства населённых пунктов, повреждения инфраструктуры и зелёных насаждений. Например, вопрос может касаться содержания территории или повреждённого благоустройства. Конкретная квалификация зависит от обстоятельств и действующих правил. Сохраните адрес, дату и фото, сделанные безопасно. Размер взыскания проверяйте по актуальному тексту закона.',
        source_url='https://adilet.zan.kz/rus/docs/K1400000235')], max_length=8)

    @field_validator('map_url', 'source_url')
    @classmethod
    def safe_url(cls, value):
        return Tip.safe_url(value)

    @field_validator('duty_phone', 'duty_whatsapp')
    @classmethod
    def phone(cls, value):
        if value and (not all(c.isdigit() or c in '+ ()-' for c in value) or not 7 <= sum(c.isdigit() for c in value) <= 15):
            raise ValueError('Укажите телефон с кодом города или страны')
        return value

    @field_validator('verified_on')
    @classmethod
    def no_future_verification(cls, value):
        if value and value > date.today():
            raise ValueError('Дата проверки не может быть в будущем')
        return value

@router.get('', response_model=DirectoryData)
async def get_directory(db: AsyncSession = Depends(get_db)):
    row = await db.get(InspectorDirectory, 1)
    if not row:
        return DirectoryData()
    return DirectoryData(**json.loads(row.payload), revision=row.revision)

@router.put('', response_model=DirectoryData)
async def save_directory(data: DirectoryData, db: AsyncSession = Depends(get_db), _admin: dict = Depends(require_panel_admin)):
    payload = data.model_dump_json(exclude={'revision'})
    if data.revision == 0:
        db.add(InspectorDirectory(id=1, payload=payload, revision=1))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, 'Сведения уже изменены. Обновите страницу перед сохранением.')
    else:
        result = await db.execute(update(InspectorDirectory).where(InspectorDirectory.id == 1, InspectorDirectory.revision == data.revision).values(payload=payload, revision=data.revision+1))
        if result.rowcount != 1:
            await db.rollback()
            raise HTTPException(409, 'Сведения уже изменены. Обновите страницу перед сохранением.')
        await db.commit()
    return data.model_copy(update={'revision': data.revision+1})
