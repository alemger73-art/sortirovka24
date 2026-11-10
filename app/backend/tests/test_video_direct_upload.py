"""Ad videos go from the browser straight to Cloudinary: the signature endpoint."""
import cloudinary.utils
import pytest
from services import ad_videos
from services.storage import _split_public_id_and_format, video_delivery_urls
from tests.test_security_stage1 import security_env  # noqa: F401

URL = '/api/v1/storage/video-upload-signature'
SECRET = 'test-secret-never-sent'


@pytest.fixture
def cloud(monkeypatch):
    monkeypatch.setenv('CLOUDINARY_URL', f'cloudinary://test-key:{SECRET}@demo')


def _body(object_key):
    return {'bucket_name': 'portal-images', 'object_key': object_key}


async def test_signature_needs_an_account(security_env, cloud):
    client, _, _ = security_env
    assert (await client.post(URL, json=_body('announcements/videos/clip.mp4'))).status_code == 401


@pytest.mark.parametrize('key', ['announcements/clip.mp4', 'complaints/clip.mp4', 'announcements/videos/clip.avi',
                                 'announcements/videos/clip.jpg', 'announcements/videos/clip',
                                 'announcements/videos/../clip.mp4', 'announcements/videos/sub/clip.mp4'])
async def test_only_ad_videos_are_signed(security_env, cloud, key):
    client, _, headers = security_env
    assert (await client.post(URL, json=_body(key), headers=headers['alice'])).status_code == 400


@pytest.mark.parametrize('ext', ['mp4', 'MOV', 'webm'])
async def test_signature_verifies_and_matches_the_stored_key(security_env, cloud, ext):
    client, _, headers = security_env
    r = await client.post(URL, json=_body(f'announcements/videos/1700000000-abc.{ext}'), headers=headers['alice'])
    assert r.status_code == 200, r.text
    data = r.json()
    assert SECRET not in r.text
    assert (data['cloud_name'], data['api_key'], data['resource_type'], data['overwrite']) == ('demo', 'test-key', 'video', 'false')

    key = data['object_key']
    assert ad_videos.clean_key(key) == key  # the ad form saves it as video_key unchanged
    assert data['public_id'] == _split_public_id_and_format(key)[0]
    assert key.endswith('.' + ext.lower())
    assert "/video/upload/" in video_delivery_urls(key)[0] and data['public_id'] in video_delivery_urls(key)[0]

    signed = {k: data[k] for k in ('public_id', 'timestamp', 'overwrite')}
    assert data['signature'] == cloudinary.utils.api_sign_request(signed, SECRET)
    assert data['signature'] != cloudinary.utils.api_sign_request({**signed, 'public_id': 'other'}, SECRET)


async def test_each_signature_gets_its_own_key(security_env, cloud):
    client, _, headers = security_env
    keys = {(await client.post(URL, json=_body('announcements/videos/a.mp4'), headers=headers['bob'])).json()['object_key']
            for _ in range(2)}
    assert len(keys) == 2
