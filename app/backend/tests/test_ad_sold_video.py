"""«Продано» and one video per ad: owner endpoints, public visibility, upload limits."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock

import pytest
from models.announcements import Announcements
from routers import storage
from services.ad_moderation import card_text
from services.storage import StorageService
from tests.test_security_stage1 import security_env

BASE = '/api/v1/entities/announcements'
ACCOUNT = '/api/v1/account/me/announcements'
BODY = {'title': 'Велосипед', 'description': 'Рабочий велосипед', 'phone': '+77001234567', 'ann_type': 'sell'}
VIDEO = 'announcements/videos/0f1e2d3c4b5a69788796a5b4c3d2e1f0.mp4'


@pytest.fixture
def cloud(monkeypatch):
    monkeypatch.setenv('CLOUDINARY_URL', 'cloudinary://key:secret@demo')
    moderation = AsyncMock(return_value=True)
    monkeypatch.setattr('services.ad_moderation.send_for_moderation', moderation)
    return moderation


async def _live_ad(maker, user_id='alice') -> int:
    async with maker() as db:
        row = Announcements(**BODY, user_id=user_id, active=True, status='approved',
                            expires_at=(datetime.now(timezone.utc) + timedelta(days=10)).isoformat())
        db.add(row)
        await db.commit()
        return row.id


async def test_owner_marks_ad_sold_and_it_leaves_the_site(security_env):
    client, maker, headers = security_env
    ad = await _live_ad(maker)
    assert (await client.get(BASE)).json()['total'] == 1
    assert (await client.post(f'{ACCOUNT}/{ad}/sold', headers=headers['bob'])).status_code == 404
    assert (await client.post(f'{ACCOUNT}/{ad}/sold')).status_code == 401
    r = await client.post(f'{ACCOUNT}/{ad}/sold', headers=headers['alice'])
    assert r.status_code == 200, r.text
    assert (r.json()['announcement']['status'], r.json()['announcement']['active']) == ('sold', False)
    assert (await client.get(BASE)).json()['total'] == 0
    assert (await client.get(BASE + '/all')).json()['total'] == 0
    assert (await client.get(f'{BASE}/{ad}')).status_code == 404
    assert (await client.get(f'{BASE}/{ad}', headers=headers['bob'])).status_code == 404
    assert (await client.get(f'{BASE}/{ad}', headers=headers['alice'])).json()['status'] == 'sold'
    assert (await client.post(f'{ACCOUNT}/{ad}/boost', headers=headers['alice'])).status_code == 400
    # Put back on sale: like a hidden ad, it goes through moderation again.
    r = await client.post(f'{ACCOUNT}/{ad}/extend', headers=headers['alice'])
    assert r.json()['announcement']['status'] == 'pending'


async def test_video_is_saved_shown_and_removed(security_env, cloud):
    client, maker, headers = security_env
    plain = await _live_ad(maker)
    r = await client.post(BASE, headers=headers['alice'], json={**BODY, 'video_key': VIDEO})
    assert r.status_code == 201, r.text
    created = r.json()
    ad = created['id']
    assert created['video_url'] == 'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/' + VIDEO
    assert created['video_poster_url'] == 'https://res.cloudinary.com/demo/video/upload/q_auto,so_1/v1/' + VIDEO[:-3] + 'jpg'
    # The owner's Telegram card gets the link to watch it.
    assert cloud.await_args.args[1] == created['video_url']

    assert (await client.put(f'{BASE}/{ad}', headers=headers['panel'], json={'status': 'approved'})).status_code == 200
    items = {i['id']: i for i in (await client.get(BASE)).json()['items']}
    assert items[ad]['video_url'] == created['video_url'] and items[plain]['video_url'] is None
    assert items[plain]['video_poster_url'] is None
    assert (await client.get(f'{BASE}/{ad}')).json()['video_poster_url'] == created['video_poster_url']
    mine = (await client.get(f'{ACCOUNT}/{ad}', headers=headers['alice'])).json()
    assert mine['video_key'] == VIDEO and mine['video_url'] == created['video_url']
    from routers.account_v2 import _announcements_with_stats
    async with maker() as db:  # «Мои объявления» in the cabinet: one query for all videos
        rows = [await db.get(Announcements, plain), await db.get(Announcements, ad)]
        cabinet = await _announcements_with_stats(db, rows)
    assert [a['video_key'] for a in cabinet] == [None, VIDEO]

    # Sending the same video again changes nothing, so the ad stays on the site.
    r = await client.put(f'{ACCOUNT}/{ad}', headers=headers['alice'], json={'video_key': VIDEO})
    assert r.json()['announcement']['status'] == 'approved'
    # Someone else cannot touch it.
    assert (await client.put(f'{ACCOUNT}/{ad}', headers=headers['bob'], json={'video_key': ''})).status_code == 404
    assert (await client.get(f'{BASE}/{ad}')).json()['video_url']
    # Removing the video is a change: back to moderation, like a new photo.
    r = await client.put(f'{ACCOUNT}/{ad}', headers=headers['alice'], json={'video_key': ''})
    assert r.status_code == 200, r.text
    assert (r.json()['announcement']['status'], r.json()['announcement']['video_url']) == ('pending', None)
    # A new video from the owner is moderated too, with the link in the card.
    other = VIDEO.replace('.mp4', '.mov')
    assert (await client.put(f'{BASE}/{ad}', headers=headers['panel'], json={'status': 'approved'})).status_code == 200
    r = await client.put(f'{ACCOUNT}/{ad}', headers=headers['alice'], json={'video_key': other})
    assert r.json()['announcement']['status'] == 'pending'
    assert cloud.await_args.args[1].endswith(other[:-3] + 'mp4')
    # The admin can set or remove it as well; deleting the ad drops the video.
    r = await client.put(f'{BASE}/{ad}', headers=headers['panel'], json={'video_key': ''})
    assert r.status_code == 200 and r.json()['video_url'] is None
    await client.put(f'{BASE}/{ad}', headers=headers['panel'], json={'video_key': VIDEO})
    assert (await client.delete(f'{ACCOUNT}/{ad}', headers=headers['alice'])).status_code == 200
    from services import ad_videos
    async with maker() as db:
        assert await ad_videos.keys_for(db, [ad]) == {}


@pytest.mark.parametrize('key', ['announcements/videos/clip.avi', 'announcements/videos/clip.jpg', 'other/clip.mp4',
                                 'announcements/videos/../clip.mp4', 'https://evil.example/clip.mp4'])
async def test_wrong_video_is_refused_without_side_effects(security_env, cloud, key):
    client, maker, headers = security_env
    r = await client.post(BASE, headers=headers['alice'], json={**BODY, 'video_key': key})
    assert r.status_code == 400, r.text
    assert (await client.get(BASE, headers=headers['panel'])).json()['total'] == 0
    ad = await _live_ad(maker)
    assert (await client.put(f'{ACCOUNT}/{ad}', headers=headers['alice'], json={'video_key': key})).status_code == 400
    row = (await client.get(f'{BASE}/{ad}')).json()
    assert row['status'] == 'approved' and row['video_url'] is None


async def test_upload_proxy_allows_a_bigger_video_than_photo(security_env, monkeypatch):
    client, _, _ = security_env
    service = object.__new__(StorageService)
    service.api_secret = 'synthetic-secret'; service.cloud_name = 'demo'; service.api_key = 'synthetic'
    monkeypatch.setattr(storage, 'StorageService', lambda: service)
    monkeypatch.setattr(storage, 'MAX_UPLOAD_BYTES', 8)
    monkeypatch.setattr(storage, 'MAX_VIDEO_UPLOAD_BYTES', 16)
    upload = Mock(return_value={'secure_url': 'https://res.cloudinary.com/demo/video/upload/v1/' + VIDEO})
    monkeypatch.setattr('cloudinary.uploader.upload', upload)
    video = service._make_upload_token('portal-images', VIDEO)
    photo = service._make_upload_token('portal-images', 'announcements/a.webp', thumbnail_key='announcements/thumbs/a.webp', is_image=True)

    r = await client.put(f'/api/v1/storage/upload-proxy/{video}', content=b'x' * 12, headers={'Content-Type': 'application/octet-stream'})
    assert r.status_code == 200, r.text
    # Stored as a video even when the phone sent no proper Content-Type, and never run through photo optimisation.
    assert upload.call_args.kwargs['resource_type'] == 'video' and upload.call_args.args[0] == b'x' * 12
    assert (await client.put(f'/api/v1/storage/upload-proxy/{video}', content=b'x' * 17)).status_code == 413
    assert (await client.put(f'/api/v1/storage/upload-proxy/{photo}', content=b'x' * 12)).status_code == 413
    assert upload.call_count == 1


def test_moderation_card_keeps_the_video_link():
    ann = Announcements(id=5, title='Диван', description='очень длинное описание ' * 80, phone='+77001234567', ann_type='sell')
    text = card_text(ann, 'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/a.mp4')
    assert len(text) <= 1000 and text.endswith('<a href="https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/a.mp4">Смотреть видео</a>')
    assert 'Смотреть видео' not in card_text(ann)
