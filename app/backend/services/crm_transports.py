"""Bounded API clients. Configuration is read only by the separately launched worker."""
import asyncio
import json
import os
from functools import partial
from urllib.parse import quote

import httpx
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from services.telegram import _get_config
from services.crm_delivery import delivery_allowed


class DeliveryError(RuntimeError):
    pass


class GoogleSheets:
    def __init__(self, client):
        self.client = client
        self.spreadsheet = os.environ["S24_CRM_SPREADSHEET_ID"]
        self.tab = os.environ["S24_CRM_SHEET_TAB"]
        self.credentials = service_account.Credentials.from_service_account_info(
            json.loads(os.environ["S24_CRM_GOOGLE_SERVICE_ACCOUNT_JSON"]),
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        self.credentials = self.credentials.with_token_uri("https://oauth2.googleapis.com/token")
        self.crm_url = f"https://docs.google.com/spreadsheets/d/{self.spreadsheet}/edit"

    async def write(self, row, values):
        if not delivery_allowed():
            raise DeliveryError("disabled")
        if not self.credentials.valid:
            await asyncio.to_thread(self.credentials.refresh, partial(Request(), timeout=15))
        tab = self.tab.replace("'", "''")
        range_name = quote(f"'{tab}'!A{row}:N{row}", safe="")
        if row == 1:
            check = await self.client.get(
                f"https://sheets.googleapis.com/v4/spreadsheets/{quote(self.spreadsheet, safe='')}/values/"
                + quote(f"'{tab}'!A:N", safe=""),
                headers={"Authorization": f"Bearer {self.credentials.token}"},
            )
            if check.status_code != 200 or check.json().get("values"):
                raise DeliveryError("Header initialization requires an empty dedicated tab")
        if row > 1:
            # Refuse to overwrite manually moved rows or a foreign/nonempty tab.
            check = await self.client.get(
                f"https://sheets.googleapis.com/v4/spreadsheets/{quote(self.spreadsheet, safe='')}/values/"
                + quote(f"'{tab}'!A:A", safe=""),
                headers={"Authorization": f"Bearer {self.credentials.token}"},
            )
            if check.status_code != 200:
                raise DeliveryError("Sheets identity check failed")
            keys = check.json().get("values", [])
            if not keys or keys[0] != ["ID С24"]:
                raise DeliveryError("Initialize an empty dedicated CRM tab first")
            for index, key in enumerate(keys, 1):
                if key and key[0] == values[0] and index != row:
                    raise DeliveryError("CRM row moved; restore original row order")
            if len(keys) >= row and keys[row - 1] and keys[row - 1][0] != values[0]:
                raise DeliveryError("CRM row occupied by another request")
        response = await self.client.put(
            f"https://sheets.googleapis.com/v4/spreadsheets/{quote(self.spreadsheet, safe='')}/values/{range_name}",
            params={"valueInputOption": "RAW"},
            headers={"Authorization": f"Bearer {self.credentials.token}"},
            json={"values": [values]},
        )
        if response.status_code == 401:
            self.credentials.token = None
        if response.status_code != 200 or response.json().get("updatedRows") != 1:
            raise DeliveryError("Sheets write failed")


class Telegram:
    def __init__(self, client):
        self.client = client

    async def send(self, category, text):
        if not delivery_allowed():
            raise DeliveryError("disabled")
        token, chat = _get_config(category)
        if not token or not chat:
            raise DeliveryError("Telegram configuration missing")
        response = await self.client.post(f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text, "link_preview_options": {"is_disabled": True}})
        if response.status_code != 200 or response.json().get("ok") is not True:
            raise DeliveryError("Telegram send failed")
