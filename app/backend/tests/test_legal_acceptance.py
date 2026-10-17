"""No provider calls or production DB: exercise authentic versioned consent receipts."""
import json
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from sqlalchemy import select
from core.legal import LEGAL_VERSION, acceptance_payload
from models.user_management import UserAction
from tests import test_quick_account_auth as auth_fixture
from services.support_settings import public_settings_payload


class LegalPayloadTests(unittest.TestCase):
    def test_legacy_boolean_is_not_falsely_certified_as_current(self):
        self.assertIsNone(acceptance_payload(None, accepted=True, allow_legacy=True))
        with self.assertRaises(HTTPException) as error:
            acceptance_payload(None, accepted=True)
        self.assertEqual(error.exception.status_code, 428)

    def test_outdated_and_unaccepted_versions_rejected(self):
        for version, accepted, status in [('2025-06-13', True, 409), (LEGAL_VERSION, False, 400)]:
            with self.assertRaises(HTTPException) as error:
                acceptance_payload(version, accepted=accepted)
            self.assertEqual(error.exception.status_code, status)

    def test_checkout_receipt_has_order_terms_and_no_marketing_permission(self):
        receipt = acceptance_payload(LEGAL_VERSION, accepted=True, language='kz', order=True, subject_name='Тест Тестов')
        self.assertEqual(set(receipt['documents']), {'food-terms', 'consent', 'privacy'})
        self.assertFalse(receipt['marketing_consent'])
        self.assertTrue(all(len(digest) == 64 for digest in receipt['documents'].values()))

    def test_current_consent_requires_subject_full_name(self):
        with self.assertRaises(HTTPException) as error:
            acceptance_payload(LEGAL_VERSION, accepted=True, subject_name='Пользователь')
        self.assertEqual(error.exception.status_code, 400)

    def test_transfer_details_remain_private_even_if_old_admin_setting_verified(self):
        public = public_settings_payload({'payment_details_verified':'true','promo_enabled':'true',
                                         'iban':'private-account','bin':'private-id','kaspi_qr_url':'private-qr'})
        self.assertFalse(public['promo_enabled'])
        for key in ('iban','bin','kaspi_qr_url','recipient','bank','kaspi_phone'):
            self.assertEqual(public[key], '')


class LegalAccountTests(auth_fixture.QuickAccountAuthTests):
    async def test_sms_provider_is_not_called_without_prior_consent(self):
        response = await self.client.post('/api/v1/account/signin/request-sms', json={'phone':'+77001234567'})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.codes, {})
        await self.request_code()
        async with self.sessions() as db:
            row = (await db.execute(select(UserAction).where(UserAction.action == 'legal_sms_consent'))).scalar_one()
            self.assertEqual(row.entity_id, '+77001234567')

    async def test_new_account_cannot_omit_version_even_with_old_true_booleans(self):
        code = await self.request_code()
        response = await self.client.post('/api/v1/account/signin/confirm', json={
            'phone':'+77001234567', 'code':code, 'agreement_accepted':True, 'privacy_accepted':True})
        self.assertEqual(response.status_code, 428, response.text)
        self.assertEqual((await self.confirm(code)).status_code, 200)

    async def test_google_start_uses_server_state_not_full_name_in_redirect_url(self):
        from models.auth import OIDCState
        from routers import account_v2 as account
        with patch.object(account, 'google_oauth_enabled', return_value=True), patch.object(
                account, 'build_google_authorization_url', return_value='https://accounts.google.com/o/oauth2/v2/auth?state=test'):
            response = await self.client.post('/api/v1/account/google/start', json={
                'language':'ru','accepted':True,'legal_version':LEGAL_VERSION,'legal_subject_name':'Тест ' + 'Ф' * 110})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn('Тест', response.json()['url'])
        async with self.sessions() as db:
            row = (await db.execute(select(OIDCState))).scalar_one()
            context = json.loads(row.code_verifier)
            self.assertEqual(context['legal_subject_name'], 'Тест ' + 'Ф' * 110)
            self.assertLessEqual(len(row.code_verifier), 255)
            self.assertEqual(context['legal_version'], LEGAL_VERSION)

    async def test_sms_registration_saves_versioned_receipt_with_identity(self):
        code = await self.request_code()
        response = await self.client.post('/api/v1/account/signin/confirm', json={
            'phone':'+77001234567', 'code':code, 'language':'kz',
            'agreement_accepted':True, 'privacy_accepted':True, 'legal_version':LEGAL_VERSION, 'legal_subject_name':'Тест Тестов'})
        self.assertEqual(response.status_code, 200, response.text)
        async with self.sessions() as db:
            receipt = (await db.execute(select(UserAction).where(UserAction.action == 'legal_acceptance'))).scalar_one()
            self.assertEqual(receipt.user_id, response.json()['user_id'])
            payload = json.loads(receipt.payload)
            self.assertEqual(payload['version'], LEGAL_VERSION)
            self.assertEqual(payload['language'], 'kz')
            self.assertIsNotNone(receipt.created_at)

    async def test_stale_version_does_not_consume_sms_code(self):
        code = await self.request_code()
        body = {'phone':'+77001234567','code':code,'agreement_accepted':True,'privacy_accepted':True,'legal_version':'old', 'legal_subject_name':'Тест Тестов'}
        self.assertEqual((await self.client.post('/api/v1/account/signin/confirm',json=body)).status_code, 409)
        body['legal_version'] = LEGAL_VERSION
        self.assertEqual((await self.client.post('/api/v1/account/signin/confirm',json=body)).status_code, 200)
