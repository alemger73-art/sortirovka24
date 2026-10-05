"""Provider-contract regression checks; no real SMS or production database."""
import os
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from services import sms

class MobizonDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def send(self,status,campaign=2):
        with patch.object(sms,'_mobizon_post',AsyncMock(side_effect=[
            {'code':0,'data':{'messageId':'42','status':campaign}},
            {'code':0,'data':[{'id':'42','status':status}]}])):
            return await sms._send_mobizon('+77000000000','test')

    async def test_documented_delivered_status(self):
        result=await self.send('DELIVRD',campaign=1)
        self.assertTrue(result.delivered)
        self.assertFalse(result.pending_moderation)

    async def test_acceptance_and_queue_are_not_delivery(self):
        for status in ['NEW','ENQUEUD','ACCEPTD','PDLIVRD','UNKNOWN']:
            with self.subTest(status=status):self.assertFalse((await self.send(status)).delivered)

    async def test_moderation_remains_pending(self):
        result=await self.send('NEW',campaign=1)
        self.assertTrue(result.pending_moderation)
        self.assertFalse(result.delivered)

    async def test_all_terminal_failures_report_failure(self):
        for status in sms.MOBIZON_FAILED_STATUSES:
            with self.subTest(status=status):
                with self.assertRaises(sms.SMSDeliveryError):await self.send(status)

    async def test_unrelated_message_status_not_used(self):
        with patch.object(sms,'_mobizon_post',AsyncMock(side_effect=[
            {'code':0,'data':{'messageId':'42','status':2}},
            {'code':0,'data':[{'id':'999','status':'DELIVRD'}]}])):
            self.assertFalse((await sms._send_mobizon('+77000000000','test')).delivered)

    async def test_dlr_failure_does_not_repeat_send(self):
        mock=AsyncMock(side_effect=[{'code':0,'data':{'messageId':'42','status':2}},httpx.ReadTimeout('timeout')])
        with patch.object(sms,'_mobizon_post',mock):
            self.assertFalse((await sms._send_mobizon('+77000000000','test')).delivered)
            self.assertEqual(mock.await_count,2)

    async def test_credentials_in_body_only_and_error_redacted(self):
        client=AsyncMock()
        response=httpx.Response(200,json={'code':9,'message':'secret phone OTP'},request=httpx.Request('POST','https://api.mobizon.kz'))
        client.post.return_value=response
        with patch.dict(os.environ,{'MOBIZON_API_KEY':'private-key'}),patch.object(sms.httpx,'AsyncClient') as cls:
            cls.return_value.__aenter__.return_value=client
            with self.assertRaises(sms.SMSDeliveryError) as error:await sms._mobizon_post('/service/user/getOwnBalance')
            self.assertNotIn('secret',str(error.exception))
            self.assertEqual(client.post.call_args.kwargs['data']['apiKey'],'private-key')
            self.assertNotIn('params',client.post.call_args.kwargs)

    async def test_invalid_payload_cannot_be_success(self):
        for value in [None,[],{}, {'data':{} }]:
            response=httpx.Response(200,json=value,request=httpx.Request('POST','https://api.mobizon.kz'))
            client=AsyncMock();client.post.return_value=response
            with patch.dict(os.environ,{'MOBIZON_API_KEY':'private-key'}),patch.object(sms.httpx,'AsyncClient') as cls:
                cls.return_value.__aenter__.return_value=client
                with self.assertRaises(sms.SMSDeliveryError):await sms._mobizon_post('/service/message/sendSmsMessage')

if __name__=='__main__':unittest.main()
