"""Announcement lifecycle through HTTP and real SQL, without external writes."""
from datetime import datetime, timedelta, timezone

import pytest
from models.announcements import Announcements
from models.categories import Categories
from tests.test_security_stage1 import security_env

BASE = '/api/v1/entities/announcements'
ACCOUNT = '/api/v1/account/me/announcements'
BODY = {'title': 'Велосипед', 'description': 'Рабочий велосипед', 'phone': '+77001234567', 'ann_type': 'sell'}


async def test_complete_announcement_lifecycle(security_env):
    client, maker, headers = security_env
    r = await client.post(BASE, headers=headers['alice'], json=BODY)
    assert r.status_code == 201, r.text
    row = r.json()
    assert row['status'] == 'pending' and row['expires_at'] is None
    path = f"{BASE}/{row['id']}"
    own = f"{ACCOUNT}/{row['id']}"
    assert (await client.get(path)).status_code == 404
    assert (await client.get(path, headers=headers['bob'])).status_code == 404
    assert (await client.get(path, headers=headers['alice'])).status_code == 200
    assert (await client.post(own + '/extend', headers=headers['alice'])).status_code == 400

    r = await client.put(path, headers=headers['panel'], json={'status': 'approved'})
    assert r.status_code == 200, r.text
    expires = datetime.fromisoformat(r.json()['expires_at'])
    assert timedelta(days=29) < expires - datetime.now(timezone.utc) <= timedelta(days=30)
    assert (await client.get(BASE)).json()['total'] == 1
    # Opening the page does not count by itself; the page reports a real view once per person per day.
    first = (await client.get(path)).json()['views_count']
    assert (await client.get(path)).json()['views_count'] == first
    assert (await client.put(own, headers=headers['bob'], json={'title': 'Чужое'})).status_code == 404
    assert (await client.put(own, headers=headers['alice'], json={'title': 'Исправлено'})).status_code == 200
    assert (await client.get(BASE)).json()['total'] == 0
    assert (await client.get(path, headers=headers['alice'])).json()['expires_at'] is None
    assert (await client.put(path, headers=headers['panel'], json={'status': 'approved'})).status_code == 200
    assert (await client.post(own + '/unpublish', headers=headers['alice'])).status_code == 200
    assert (await client.get(BASE)).json()['total'] == 0
    assert (await client.post(own + '/extend', headers=headers['alice'])).json()['announcement']['status'] == 'pending'
    assert (await client.put(path, headers=headers['panel'], json={'status': 'rejected'})).status_code == 200
    assert (await client.put(own, headers=headers['alice'], json={'description': 'Уточнение'})).json()['announcement']['status'] == 'pending'
    assert (await client.delete(own, headers=headers['alice'])).status_code == 200
    assert (await client.get(path, headers=headers['alice'])).status_code == 404


@pytest.mark.parametrize('active,status,expired', [(True, 'approved', True), (False, 'published', False), (True, 'pending', False)])
async def test_unavailable_rows_not_public_or_boostable(security_env, active, status, expired):
    client, maker, headers = security_env
    async with maker() as db:
        row = Announcements(**BODY, user_id='alice', active=active, status=status,
                            expires_at=(datetime.now(timezone.utc) + timedelta(days=-1 if expired else 1)).isoformat())
        db.add(row)
        await db.commit()
        item_id = row.id
    assert (await client.get(BASE)).json()['total'] == 0
    assert (await client.get(BASE + '/all')).json()['total'] == 0
    assert (await client.get(f'{BASE}/{item_id}')).status_code == 404
    assert (await client.post(f'{ACCOUNT}/{item_id}/boost', headers=headers['alice'])).status_code == 400


@pytest.mark.parametrize('patch', [{'title': '  '}, {'phone': '123'}, {'description': ''}, {'whatsapp': '12'}])
async def test_invalid_submission_has_no_side_effect(security_env, patch):
    client, _, headers = security_env
    r = await client.post(BASE, headers=headers['alice'], json={**BODY, **patch})
    assert r.status_code == 400, r.text
    assert (await client.get(BASE, headers=headers['panel'])).json()['total'] == 0


async def test_router_guards_work_with_generic_guard_disabled(security_env, monkeypatch):
    client, _, headers = security_env
    monkeypatch.setenv('ENTITY_WRITE_PROTECTION', 'off')
    r = await client.post(BASE, headers=headers['alice'], json=BODY)
    path = f"{BASE}/{r.json()['id']}"
    assert (await client.put(path, json={'status': 'approved'})).status_code == 403
    assert (await client.delete(path)).status_code == 403
    assert (await client.put(BASE + '/batch', json={'items': []})).status_code == 403


async def test_submission_requires_an_active_account(security_env):
    client, _, headers = security_env
    assert (await client.post(BASE, json=BODY)).status_code == 401
    await client.post('/api/v1/account/logout', headers=headers['alice'])
    assert (await client.post(BASE, headers=headers['alice'], json=BODY)).status_code == 401


async def test_category_consistency_and_invalid_gallery(security_env):
    client, maker, headers = security_env
    async with maker() as db:
        db.add_all([Categories(id=101, name='Продам', slug='prodam', cat_type='announcements', is_active=True),
                    Categories(id=102, name='Куплю', slug='kuplyu', cat_type='announcements', is_active=True),
                    Categories(id=103, name='Новости', slug='news', cat_type='news', is_active=True)])
        await db.commit()
    bad = await client.post(BASE, headers=headers['alice'], json={**BODY, 'category_id': 103})
    assert bad.status_code == 400
    bad = await client.post(BASE, headers=headers['alice'], json={**BODY, 'gallery_images': '1,2,3,4,5,6'})
    assert bad.status_code == 400
    row = (await client.post(BASE, headers=headers['alice'], json={**BODY, 'category_id': 101})).json()
    path = f"{BASE}/{row['id']}"
    r = await client.put(path, headers=headers['panel'], json={'ann_type': 'buy'})
    assert r.status_code == 200 and r.json()['category_id'] == 102
    r = await client.put(path, headers=headers['panel'], json={'expires_at': 'broken date'})
    assert r.status_code == 400


UA = {'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile'}


async def test_real_ad_statistics_for_owner(security_env):
    client, maker, headers = security_env
    async with maker() as db:
        row = Announcements(**BODY, user_id='alice', active=True, status='approved',
                            expires_at=(datetime.now(timezone.utc) + timedelta(days=10)).isoformat())
        db.add(row)
        await db.commit()
        ad = row.id
    ev = lambda visitor, *kinds: client.post(f'{BASE}/events', headers=UA, json={'visitor': visitor, 'events': [{'id': ad, 'kind': k} for k in kinds]})
    assert (await ev('visitor-aaaa-1111', 'impression', 'view', 'phone')).json()['counted'] == 3
    # The same person again the same day is not counted twice.
    assert (await ev('visitor-aaaa-1111', 'view', 'phone')).json()['counted'] == 0
    assert (await ev('visitor-bbbb-2222', 'view', 'whatsapp', 'share', 'unknown')).json()['counted'] == 3
    # Bots and the owner's own clicks do not count.
    r = await client.post(f'{BASE}/events', headers={'User-Agent': 'Googlebot/2.1'}, json={'visitor': 'visitor-cccc-3333', 'events': [{'id': ad, 'kind': 'view'}]})
    assert r.json()['counted'] == 0
    r = await client.post(f'{BASE}/events', headers={**UA, **headers['alice']}, json={'visitor': 'visitor-dddd-4444', 'events': [{'id': ad, 'kind': 'view'}]})
    assert r.json()['counted'] == 0
    for v in ('visitor-aaaa-1111', 'visitor-bbbb-2222'):
        assert (await client.post(f'{BASE}/{ad}/save', headers=UA, json={'visitor': v, 'saved': True})).status_code == 202
    await client.post(f'{BASE}/{ad}/save', headers=UA, json={'visitor': 'visitor-bbbb-2222', 'saved': False})

    assert (await client.get(f'{ACCOUNT}/{ad}/stats', headers=headers['bob'])).status_code == 404
    stats = (await client.get(f'{ACCOUNT}/{ad}/stats', headers=headers['alice'])).json()
    t = stats['totals']
    assert (t['view'], t['people'], t['phone'], t['whatsapp'], t['share'], t['impression'], t['saves'], t['contacted']) == (2, 2, 1, 1, 1, 1, 1, 2)
    assert len(stats['days']) == 14 and stats['days'][-1]['views'] == 2 and stats['days'][-1]['contacts'] == 2
    from routers.account_v2 import _announcements_with_stats
    async with maker() as db:
        row = await db.get(Announcements, ad)
        mine = (await _announcements_with_stats(db, [row]))[0]
    assert mine['stats'] == {'views': 2, 'people': 2, 'saves': 1, 'contacts': 2, 'impressions': 1}
    assert mine['views_count'] == 2
