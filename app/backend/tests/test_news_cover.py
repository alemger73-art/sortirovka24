import base64
import io
import httpx
import pytest
from PIL import Image
from services import news_cover


def test_branded_cover_is_unique_jpeg_with_any_title():
    a = news_cover.branded_cover('Очень длинный заголовок ' * 12, 'ЖКХ', seed='x')
    b = news_cover.branded_cover('Другая новость', 'Неизвестная категория', seed='y')
    for data in (a, b):
        img = Image.open(io.BytesIO(data))
        assert img.format == 'JPEG' and img.size == (1200, 675)
    assert a != b


@pytest.mark.asyncio
async def test_make_cover_uploads_branded_without_ai(monkeypatch):
    monkeypatch.delenv('NEWS_IMAGE_PROVIDER', raising=False)
    saved = {}
    monkeypatch.setattr(news_cover, '_upload', lambda key, payload: saved.update(key=key, size=len(payload)) or f'https://cdn/{key}')
    async with httpx.AsyncClient() as client:
        url = await news_cover.make_cover(client, title='Тест', category='Спорт', link='https://x/1', image_prompt='stadium')
    assert url.startswith('https://cdn/news-covers/') and saved['size'] > 10000


@pytest.mark.asyncio
async def test_ai_picture_is_used_and_marked(monkeypatch):
    monkeypatch.setenv('NEWS_IMAGE_PROVIDER', 'openai')
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    png = io.BytesIO(); Image.new('RGB', (1536, 1024), (10, 120, 60)).save(png, 'PNG')
    def handler(request):
        assert request.url.host == 'api.openai.com' and b'No text' in request.content
        return httpx.Response(200, json={'data': [{'b64_json': base64.b64encode(png.getvalue()).decode()}]})
    out = {}
    monkeypatch.setattr(news_cover, '_upload', lambda key, payload: out.update(payload=payload) or 'https://cdn/x.jpg')
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await news_cover.make_cover(client, title='Т', category='Экономика', link='l', image_prompt='market') == 'https://cdn/x.jpg'
    img = Image.open(io.BytesIO(out['payload']))
    assert img.size == (1200, 675) and img.getpixel((600, 300))[1] > 80  # the green AI picture, not the dark branded card


@pytest.mark.asyncio
async def test_ai_failure_falls_back_to_branded(monkeypatch):
    monkeypatch.setenv('NEWS_IMAGE_PROVIDER', 'openai')
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setattr(news_cover, '_upload', lambda key, payload: 'https://cdn/b.jpg')
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500))) as client:
        assert await news_cover.make_cover(client, title='Т', category='Мир', link='l', image_prompt='city') == 'https://cdn/b.jpg'
