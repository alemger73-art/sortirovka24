"""Regression tests: real SQL sessions + HTTP; cloud operations are mocked."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, Depends, Request
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from core.auth import create_access_token
from core.database import Base, get_db
from models.auth import User
from models.admin_auth import AdminCredentials
from models.user_management import UserSession
from models.news import News
from models.user_preferences import User_preferences
from routers import account_v2, auth, storage, news, announcements, jobs, real_estate, user_preferences, admin_auth
from middleware.entity_guard import EntityWriteGuardMiddleware
from services.auth import AuthService
from services.bonus_spending import resolve_optional_account_user
from services.storage import StorageService
from schemas.storage import FileUpDownRequest


@pytest.fixture
async def security_env(tmp_path, monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///' + (tmp_path / 'security.db').as_posix())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([User(id='alice', name='Alice', role='user', status='active', is_active=True),
                    User(id='bob', name='Bob', role='user', status='active', is_active=True),
                    User(id='manager', name='Manager', role='superadmin', status='active', is_active=True),
                    AdminCredentials(username='stage-admin', password_hash='unused-in-test', is_active=True)])
        await db.flush()
        for uid in ('alice', 'bob', 'manager'):
            db.add(UserSession(user_id=uid, token_jti=uid+'-session', is_active=True,
                               expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
        await db.commit()
    async def database():
        async with maker() as db:
            yield db
    test_app = FastAPI()
    for router in (account_v2.router, auth.router, storage.router, news.router,
                   announcements.router, jobs.router, real_estate.router, user_preferences.router):
        test_app.include_router(router)
    test_app.add_middleware(EntityWriteGuardMiddleware)
    test_app.dependency_overrides[get_db] = database
    @test_app.get('/test/bonus-user')
    async def bonus_user(request: Request, db=Depends(get_db)):
        user = await resolve_optional_account_user(request, db)
        return {'id': user.id if user else None}
    monkeypatch.setenv('ENTITY_WRITE_PROTECTION', 'on')
    monkeypatch.setenv('EXTERNAL_SIDE_EFFECTS', 'disabled')
    monkeypatch.setattr('services.admin_alerts.alert_new_announcement', AsyncMock())
    tokens = {uid: create_access_token({'sub': uid, 'role': 'user', 'jti':uid+'-session'})
              for uid in ('alice','bob','manager')}
    tokens['panel'] = admin_auth._create_admin_jwt('stage-admin')
    async with AsyncClient(transport=ASGITransport(app=test_app),base_url='http://test') as client:
        yield client, maker, {k:{'Authorization':'Bearer '+v} for k,v in tokens.items()}
    await engine.dispose()


@pytest.mark.parametrize('logout_path', ['/api/v1/account/logout','/api/v1/auth/logout'])
async def test_logout_revokes_all_account_consumers(security_env, logout_path):
    client, _, headers = security_env
    assert (await client.get('/api/v1/auth/me',headers=headers['alice'])).status_code == 200
    resp = await client.request('POST' if '/account/' in logout_path else 'GET',logout_path,headers=headers['alice'])
    assert resp.status_code == 200
    for path in ['/api/v1/auth/me','/api/v1/account/me','/api/v1/entities/user_preferences/all']:
        assert (await client.get(path,headers=headers['alice'])).status_code == 401
    assert (await client.get('/test/bonus-user',headers=headers['alice'])).json()['id'] is None
    assert (await client.get('/api/v1/auth/me',headers=headers['bob'])).status_code == 200


@pytest.mark.parametrize('state', ['blocked','deleted','inactive','expired','revoked','missing'])
async def test_invalid_account_session_is_rejected_everywhere(security_env, state):
    client, maker, headers = security_env
    async with maker() as db:
        user = await db.get(User,'alice')
        session = await db.scalar(select(UserSession).where(UserSession.user_id=='alice'))
        if state in ('blocked','deleted'): user.status=state
        elif state=='inactive': user.is_active=False
        elif state=='expired': session.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)
        elif state=='revoked': session.is_active=False
        else: await db.delete(session)
        await db.commit()
    for path in ['/api/v1/account/me','/api/v1/auth/me']:
        assert (await client.get(path,headers=headers['alice'])).status_code == 401
    assert (await client.get('/test/bonus-user',headers=headers['alice'])).json()['id'] is None


async def test_block_unblock_does_not_restore_old_sessions(security_env):
    client, _, headers=security_env
    path='/api/v1/account/admin/users/alice'
    for status in ('blocked','active'):
        r=await client.put(path,headers=headers['manager'],json={'status':status})
        assert r.status_code==200,r.text
    assert (await client.get('/api/v1/account/me',headers=headers['alice'])).status_code==401


async def test_current_role_and_oidc_sessions(security_env):
    client,maker,headers=security_env
    async with maker() as db:
        user=await db.get(User,'alice'); user.role='master'; await db.commit()
        token,_,claims=await AuthService(db).issue_app_token(user)
        assert claims['jti']
    assert (await client.get('/api/v1/auth/me',headers=headers['alice'])).json()['role']=='master'
    oidc={'Authorization':'Bearer '+token}
    assert (await client.get('/api/v1/account/me',headers=oidc)).status_code==200
    await client.post('/api/v1/account/logout',headers=oidc)
    assert (await client.get('/api/v1/auth/me',headers=oidc)).status_code==401


async def test_storage_mutations_never_reach_cloud_for_residents(security_env,monkeypatch):
    client,_,headers=security_env
    fake=Mock(); fake.delete_object=AsyncMock(return_value={'success':True}); fake.rename_object=AsyncMock()
    monkeypatch.setattr(storage,'StorageService',lambda:fake)
    for method,path,body in [('DELETE','delete-object',{'object_key':'other/avatar.jpg'}),
                             ('POST','rename-object',{'source_key':'other/avatar.jpg','destination_key':'stolen.jpg'})]:
        body['bucket_name']='portal-images'
        r=await client.request(method,'/api/v1/storage/'+path,headers=headers['alice'],json=body)
        assert r.status_code==403,r.text
    fake.delete_object.assert_not_called(); fake.rename_object.assert_not_called()
    r=await client.request('DELETE','/api/v1/storage/delete-object',headers=headers['panel'],
                           json={'bucket_name':'portal-images','object_key':'test.jpg'})
    assert r.status_code==200,r.text


async def test_upload_gets_server_key_and_cannot_overwrite(monkeypatch):
    service=object.__new__(StorageService)
    service.api_secret='synthetic-secret'; service.cloud_name='synthetic'; service.api_key='synthetic'
    monkeypatch.setattr(service, '_cloudinary_url', lambda key: 'https://example.invalid/'+key)
    req=FileUpDownRequest(bucket_name='portal-images',object_key='other/avatar.jpg')
    a=await service.create_upload_url(req); b=await service.create_upload_url(req)
    assert a.object_key!=b.object_key and a.object_key!='other/avatar.webp'
    upload=Mock(return_value={'secure_url':'https://example.invalid/new.webp'})
    monkeypatch.setattr('cloudinary.uploader.upload',upload)
    service._upload_cloudinary_bytes(a.object_key,b'fake')
    assert upload.call_args.kwargs['overwrite'] is False
    # Non-image uploads used to retain a caller-controlled key as well.
    pdf=await service.create_upload_url(FileUpDownRequest(bucket_name='portal-images',object_key='other/document.pdf'))
    assert pdf.object_key!='other/document.pdf' and pdf.object_key.endswith('.pdf')


@pytest.mark.parametrize('entity,title', [('announcements',{'title':'Test'}),('jobs',{'job_title':'Test'}),('real_estate',{'title':'Test'})])
@pytest.mark.parametrize('approved_status', ['approved','published'])
async def test_public_creation_moderation_and_approval(security_env,entity,title,approved_status):
    client,_,headers=security_env
    base='/api/v1/entities/'+entity
    body={**title,'status':'approved','active':True,'user_id':'bob',
          'promoted_until':'2099-01-01','promotion_tier':'premium','views_count':999}
    r=await client.post(base,json=body); assert r.status_code==201,r.text
    data=r.json(); assert data['status']=='pending'
    if entity in ('announcements','real_estate'):
        assert data['user_id'] is None and data['promotion_tier'] is None and data['views_count']==0
    item=base+'/'+str(data['id'])
    assert (await client.get(item)).status_code==404
    for suffix in ('','/all'):
        assert (await client.get(base+suffix,params={'query':'{"status":"pending"}'})).json()['total']==0
    assert (await client.get(item,headers=headers['panel'])).status_code==200
    r=await client.put(item,headers=headers['panel'],json={'status':approved_status}); assert r.status_code==200,r.text
    assert (await client.get(item)).status_code==200
    assert (await client.get(base)).json()['total']==1


async def test_news_draft_hidden_on_every_read_and_preferences_owned(security_env):
    client,maker,headers=security_env
    async with maker() as db:
        draft=News(title='Draft',published=False); live=News(title='Live',published=True)
        db.add_all([draft,live,User_preferences(user_id='alice',theme='dark'),User_preferences(user_id='bob',theme='light')]); await db.commit()
        draft_id=draft.id
    for suffix in ('','/all'):
        r=await client.get('/api/v1/entities/news'+suffix)
        assert [x['title'] for x in r.json()['items']]==['Live']
    assert (await client.get(f'/api/v1/entities/news/{draft_id}')).status_code==404
    assert (await client.get(f'/api/v1/entities/news/{draft_id}',headers=headers['panel'])).status_code==200
    base='/api/v1/entities/user_preferences/all'
    assert (await client.get(base)).status_code==401
    r=await client.get(base,headers=headers['alice'],params={'query':'{"user_id":"bob"}'})
    assert r.status_code==200 and r.json()['total']==0
    r=await client.get(base,headers=headers['alice'])
    assert [x['user_id'] for x in r.json()['items']]==['alice']


async def test_admin_bootstrap_has_no_default_password_or_reactivation(security_env,monkeypatch):
    _,maker,_=security_env
    monkeypatch.setattr(admin_auth.db_manager,'ensure_initialized',AsyncMock())
    monkeypatch.setattr(admin_auth.db_manager,'async_session_maker',maker)
    monkeypatch.setenv('ADMIN_USERNAME','new-admin'); monkeypatch.delenv('ADMIN_PASSWORD',raising=False)
    await admin_auth.initialize_admin_credentials()
    async with maker() as db:
        assert await db.scalar(select(AdminCredentials).where(AdminCredentials.username=='new-admin')) is None
        admin=await db.scalar(select(AdminCredentials).where(AdminCredentials.username=='stage-admin'))
        admin.is_active=False; await db.commit()
    monkeypatch.setenv('ADMIN_USERNAME','stage-admin')
    await admin_auth.initialize_admin_credentials()
    async with maker() as db:
        assert not (await db.scalar(select(AdminCredentials).where(AdminCredentials.username=='stage-admin'))).is_active


async def test_invalid_query_and_owner_spoofing(security_env):
    client,_,headers=security_env
    for entity in ('news','announcements','jobs','real_estate'):
        r=await client.get('/api/v1/entities/'+entity,params={'query':'[]'})
        assert r.status_code==400
    for entity in ('announcements','real_estate'):
        r=await client.post('/api/v1/entities/'+entity,headers=headers['alice'],
                            json={'title':'Owned','user_id':'bob','status':'approved'})
        assert r.status_code==201 and r.json()['user_id']=='alice' and r.json()['status']=='pending'


async def test_legacy_token_without_session_and_disabled_panel_are_denied(security_env):
    client,maker,headers=security_env
    legacy=create_access_token({'sub':'alice','role':'admin'})
    assert (await client.get('/api/v1/auth/me',headers={'Authorization':'Bearer '+legacy})).status_code==401
    async with maker() as db:
        admin=await db.scalar(select(AdminCredentials).where(AdminCredentials.username=='stage-admin'))
        admin.is_active=False; await db.commit()
    assert (await client.get('/api/v1/storage/list-buckets',headers=headers['panel'])).status_code==401


async def test_chunked_upload_limit(security_env,monkeypatch):
    client,_,_=security_env
    monkeypatch.setattr(storage,'MAX_UPLOAD_BYTES',8)
    async def chunks():
        yield b'12345'
        yield b'67890'
    r=await client.put('/api/v1/storage/upload-proxy/test-token',content=chunks())
    assert r.status_code==413
