import json
import re
from datetime import date
from urllib.parse import urlsplit
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def secure_url(value):
    if not value: return value
    url = urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or len(value) > 2000:
        raise ValueError('Укажите HTTPS-ссылку без логина и пароля')
    return value


class DaySchedule(BaseModel):
    model_config = ConfigDict(extra='forbid')
    times: str = Field(default='', max_length=6000)
    first: str = ''
    last: str = ''
    interval: str = Field(default='', max_length=80)
    not_running: bool = False

    @model_validator(mode='after')
    def validate_schedule(self):
        pattern = r'(?:[01]\d|2[0-3]):[0-5]\d'
        times = re.split(r'[\s,;]+', self.times.strip()) if self.times.strip() else []
        if any(not re.fullmatch(pattern, time) for time in times) or len(set(times)) != len(times):
            raise ValueError('Время должно быть ЧЧ:ММ, без повторов')
        if any(t and not re.fullmatch(pattern, t) for t in [self.first, self.last]):
            raise ValueError('Неверное время первого или последнего рейса')
        if self.not_running and (times or self.first or self.last or self.interval):
            raise ValueError('Рейсов нет: очистите время и интервал')
        if times and (self.first or self.last or self.interval):
            raise ValueError('Выберите точные отправления или интервальный график')
        if (self.first or self.last or self.interval) and not (self.first and self.last):
            raise ValueError('Нужны первый и последний рейс')
        return self


class Direction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    stops: list[str] = Field(default_factory=list, max_length=200)
    weekday: DaySchedule = Field(default_factory=DaySchedule)
    saturday: DaySchedule = Field(default_factory=DaySchedule)
    sunday: DaySchedule = Field(default_factory=DaySchedule)

    @field_validator('stops')
    @classmethod
    def check_stops(cls, stops):
        if any(not stop.strip() or len(stop) > 200 for stop in stops):
            raise ValueError('Название остановки: от 1 до 200 символов')
        return [stop.strip() for stop in stops]

    @model_validator(mode='after')
    def require_origin(self):
        if any(d.times or d.first or d.last or d.interval for d in [self.weekday,self.saturday,self.sunday]) and len(self.stops) < 2:
            raise ValueError('Для расписания укажите минимум две остановки направления')
        return self


class Journey(BaseModel):
    model_config = ConfigDict(extra='forbid')
    outbound: Direction = Field(default_factory=Direction)
    inbound: Direction = Field(default_factory=Direction)


class TransportValidation(BaseModel):
    @field_validator('source_url', 'map_url', check_fields=False)
    @classmethod
    def validate_url(cls, value): return secure_url(value)

    @field_validator('verified_at', check_fields=False)
    @classmethod
    def validate_date(cls, value):
        if value and date.fromisoformat(value) > date.today(): raise ValueError('Дата проверки не может быть в будущем')
        return value

    @field_validator('journey_json', check_fields=False)
    @classmethod
    def validate_journey(cls, value):
        if not value: return value
        if len(value) > 60000: raise ValueError('Слишком большое расписание')
        return Journey.model_validate_json(value).model_dump_json()

    @field_validator('route_number', 'route_name', check_fields=False)
    @classmethod
    def validate_name(cls, value):
        if not value or not value.strip() or len(value) > 200: raise ValueError('Укажите номер и название маршрута')
        return value.strip()


def validate_public_route(data):
    if data.get('is_active') is not True: return
    try:
        if not data.get('route_number') or not data.get('route_name') or not data.get('source_url') or not data.get('verified_at'):
            raise ValueError('Для публикации укажите номер, название, источник и дату проверки')
        secure_url(data['source_url'])
        if date.fromisoformat(data['verified_at']) > date.today(): raise ValueError('Неверная дата проверки')
        journey = Journey.model_validate_json(data.get('journey_json') or '{}')
        if max(len(journey.outbound.stops),len(journey.inbound.stops)) < 2:
            raise ValueError('Для публикации нужны остановки хотя бы одного направления')
    except ValueError as error:
        raise HTTPException(status_code=422,detail=str(error)) from error
