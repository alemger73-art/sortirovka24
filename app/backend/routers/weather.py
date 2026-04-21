"""Weather proxy router.

Fetches real-time weather data from OpenWeatherMap API for Karaganda.
Caches results for 10 minutes to avoid excessive API calls.
"""

import logging
import os
import time
from typing import Optional

import httpx
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])

# In-memory cache
_weather_cache: dict = {}
CACHE_TTL_SECONDS = 600  # 10 minutes


@router.get("")
async def get_weather():
    """Get current weather for Karaganda.
    
    Returns cached data if available and fresh (< 10 min old).
    Falls back to error response if API is unavailable.
    """
    now = time.time()
    
    # Check cache
    if _weather_cache and (now - _weather_cache.get("fetched_at", 0)) < CACHE_TTL_SECONDS:
        return _weather_cache["data"]
    
    api_key = os.environ.get("OPENWEATHERMAP_API_KEY", "")
    if not api_key:
        logger.error("[Weather] OPENWEATHERMAP_API_KEY not set")
        return {
            "success": False,
            "error": "API key not configured",
            "temp": None,
            "description": None,
            "icon": None,
            "city": "Караганда",
        }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            resp = await http_client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "q": "Karaganda",
                    "units": "metric",
                    "lang": "ru",
                    "appid": api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        
        temp = round(data["main"]["temp"])
        feels_like = round(data["main"]["feels_like"])
        description = data["weather"][0]["description"] if data.get("weather") else ""
        icon_code = data["weather"][0]["icon"] if data.get("weather") else "01d"
        weather_main = data["weather"][0]["main"] if data.get("weather") else ""
        humidity = data["main"].get("humidity", 0)
        wind_speed = round(data.get("wind", {}).get("speed", 0), 1)
        
        result = {
            "success": True,
            "temp": temp,
            "feels_like": feels_like,
            "description": description,
            "icon": icon_code,
            "weather_main": weather_main,
            "humidity": humidity,
            "wind_speed": wind_speed,
            "city": "Караганда",
        }
        
        # Update cache
        _weather_cache["data"] = result
        _weather_cache["fetched_at"] = now
        
        logger.info(f"[Weather] Fetched: {temp}°C, {description}")
        return result
        
    except httpx.HTTPStatusError as e:
        logger.error(f"[Weather] API HTTP error: {e.response.status_code} - {e.response.text[:200]}")
        # Return stale cache if available
        if _weather_cache.get("data"):
            return _weather_cache["data"]
        return {
            "success": False,
            "error": f"API error: {e.response.status_code}",
            "temp": None,
            "description": None,
            "icon": None,
            "city": "Караганда",
        }
    except Exception as e:
        logger.error(f"[Weather] Failed to fetch weather: {e}")
        # Return stale cache if available
        if _weather_cache.get("data"):
            return _weather_cache["data"]
        return {
            "success": False,
            "error": "Failed to fetch weather data",
            "temp": None,
            "description": None,
            "icon": None,
            "city": "Караганда",
        }