"""Weather proxy for the Sortirovka homepage.

Prefers OpenWeatherMap when OPENWEATHERMAP_API_KEY is set.
Falls back to Open-Meteo (no API key) so the hero widget always works.
Caches results for 10 minutes.
"""

from __future__ import annotations

import logging
import os
import time

import httpx
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])

_weather_cache: dict = {}
CACHE_TTL_SECONDS = 600

# Sortirovka district, Karaganda
LAT = 49.8047
LON = 73.1094


def _wmo_to_main(code: int) -> str:
    if code == 0:
        return "Clear"
    if code in (1, 2, 3):
        return "Clouds"
    if code in (45, 48):
        return "Fog"
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82):
        return "Rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "Snow"
    if code in (95, 96, 99):
        return "Thunderstorm"
    return "Clouds"


def _payload(temp: int, weather_main: str, description: str = "", **extra) -> dict:
    return {
        "success": True,
        "temp": temp,
        "description": description,
        "weather_main": weather_main,
        "city": "Сортировка",
        **extra,
    }


async def _from_openweathermap(api_key: str) -> dict | None:
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": LAT,
                "lon": LON,
                "units": "metric",
                "lang": "ru",
                "appid": api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    temp = round(data["main"]["temp"])
    description = data["weather"][0]["description"] if data.get("weather") else ""
    weather_main = data["weather"][0]["main"] if data.get("weather") else ""
    return _payload(
        temp,
        weather_main,
        description,
        feels_like=round(data["main"]["feels_like"]),
        icon=data["weather"][0]["icon"] if data.get("weather") else "01d",
        humidity=data["main"].get("humidity", 0),
        wind_speed=round(data.get("wind", {}).get("speed", 0), 1),
    )


async def _from_open_meteo() -> dict | None:
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": LAT,
                "longitude": LON,
                "current": "temperature_2m,weather_code",
                "timezone": "Asia/Almaty",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    current = data.get("current") or {}
    temp_raw = current.get("temperature_2m")
    if temp_raw is None:
        return None
    code = int(current.get("weather_code") or 0)
    return _payload(round(temp_raw), _wmo_to_main(code))


@router.get("")
async def get_weather():
    now = time.time()
    cached = _weather_cache.get("data")
    fetched_at = _weather_cache.get("fetched_at", 0)
    if cached and cached.get("success") and (now - fetched_at) < CACHE_TTL_SECONDS:
        return cached

    result = None
    api_key = os.environ.get("OPENWEATHERMAP_API_KEY", "").strip()
    if api_key:
        try:
            result = await _from_openweathermap(api_key)
        except Exception as e:
            logger.warning("[Weather] OpenWeatherMap failed, using Open-Meteo: %s", e)

    if result is None:
        try:
            result = await _from_open_meteo()
        except Exception as e:
            logger.error("[Weather] Open-Meteo failed: %s", e)

    if result:
        _weather_cache["data"] = result
        _weather_cache["fetched_at"] = now
        logger.info("[Weather] Fetched: %s°C, %s", result.get("temp"), result.get("weather_main"))
        return result

    if cached:
        return cached

    return {
        "success": False,
        "error": "Failed to fetch weather data",
        "temp": None,
        "description": None,
        "icon": None,
        "city": "Сортировка",
    }
