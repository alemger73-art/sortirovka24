"""Isolated HTTP/DB checks. Run: python -m unittest tests.test_partner_profiles"""
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from core.auth import create_access_token
from core.database import get_db
from models.module_settings import ModuleSettings
from models.partner_profiles import PartnerShowcase
from routers.partner_profiles import router
from services.partner_profiles_seed import seed_partner_profiles


class PartnerShowcasesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.secret = patch("core.auth._get_jwt_secret_key", return_value="isolated-partner-test-secret-not-production")
        self.secret.start()
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.maker = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(lambda c: PartnerShowcase.__table__.create(c))
            await connection.run_sync(lambda c: ModuleSettings.__table__.create(c))
        app = FastAPI()
        app.include_router(router)
        async def database():
            async with self.maker() as session:
                yield session
        app.dependency_overrides[get_db] = database
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        self.admin = {"Authorization": "Bearer " + create_access_token({"role":"admin", "username":"test-admin"})}
        self.data = json.loads((Path(__file__).parents[1] / "services/partner_profiles_seed.json").read_text(encoding="utf-8"))[0]

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()
        self.secret.stop()

    async def test_admin_only_and_invalid_input(self):
        path = "/api/v1/partners/admin/krovlya-365"
        self.assertEqual((await self.client.put(path,json=self.data)).status_code,401)
        for role in ["user", "operator", "owner", "courier"]:
            token=create_access_token({"role":role,"username":"someone"})
            response=await self.client.put(path,json=self.data,headers={"Authorization":"Bearer "+token})
            self.assertEqual(response.status_code,403)
        for changes in [{"phone":"123"}, {"instagram":"javascript:alert(1)"}, {"logo":"//evil.test/x"}, {"name":" "}, {"whatsapp":"abc7000182112"}]:
            response=await self.client.put(path,json={**self.data,**changes},headers=self.admin)
            self.assertEqual(response.status_code,422,response.text)

    async def test_publish_hide_reload_and_idempotent_seed(self):
        path="/api/v1/partners/admin/krovlya-365"
        response=await self.client.put(path,json=self.data,headers=self.admin)
        self.assertEqual(response.status_code,200,response.text)
        response=await self.client.get('/api/v1/partners/krovlya-365')
        self.assertEqual(response.json()['phone'], '+77000182112')
        self.assertEqual(len((await self.client.get('/api/v1/partners')).json()['items']),1)
        hidden={**self.data,"published":False,"headline":"Сохранённое изменение администратора"}
        self.assertEqual((await self.client.put(path,json=hidden,headers=self.admin)).status_code,200)
        async with self.maker() as session:
            await seed_partner_profiles(session)
            await seed_partner_profiles(session)
        self.assertEqual((await self.client.get('/api/v1/partners/krovlya-365')).status_code,404)
        self.assertEqual((await self.client.get('/api/v1/partners')).json()['items'],[])
        saved=(await self.client.get('/api/v1/partners/admin',headers=self.admin)).json()['items']
        self.assertEqual(len(saved),1)
        self.assertEqual(saved[0]['headline'],hidden['headline'])

    async def test_module_disabled_and_missing_company(self):
        self.assertEqual((await self.client.get('/api/v1/partners/missing')).status_code,404)
        async with self.maker() as session:
            session.add(ModuleSettings(key="business",value="false"))
            await session.commit()
        self.assertEqual((await self.client.get('/api/v1/partners')).status_code,404)
        self.assertEqual((await self.client.get('/api/v1/partners/admin',headers=self.admin)).status_code,200)

    async def test_seo_hides_drafts_and_escapes_editorial_text(self):
        from services.seo_renderer import build_seo_page
        from core.database import db_manager
        data = {**self.data, "name":"Company <script>alert(1)</script>", "services":["<img src=x>"]}
        await self.client.put('/api/v1/partners/admin/krovlya-365',json=data,headers=self.admin)
        with patch.object(db_manager, 'async_session_maker', self.maker):
            page = await build_seo_page('/partners/krovlya-365')
            self.assertEqual(page.status_code,200)
            self.assertNotIn('<img src=x>',page.body)
            self.assertIn('&lt;img',page.body)
            await self.client.put('/api/v1/partners/admin/krovlya-365',json={**data,'published':False},headers=self.admin)
            page = await build_seo_page('/partners/krovlya-365')
            self.assertEqual(page.status_code,404)
            self.assertTrue(page.robots.startswith('noindex'))


if __name__ == '__main__':
    unittest.main()
