# FrontPad Integration Module - Development Plan

## Overview
Build a FrontPad POS integration module with admin settings UI, backend sync logic, and order transmission.

## Files to Create/Modify

### Backend
1. **models/frontpad_settings.py** — SQLAlchemy model for storing FrontPad API settings (api_key, affiliate_id, sync_interval, last_sync_status, last_sync_at)
2. **routers/frontpad.py** — Custom API router with endpoints:
   - POST /api/v1/frontpad/test-connection — Test FrontPad API key
   - POST /api/v1/frontpad/sync — Trigger full menu sync from FrontPad
   - POST /api/v1/frontpad/send-order — Transmit order to FrontPad
   - GET /api/v1/frontpad/settings — Get current settings
   - PUT /api/v1/frontpad/settings — Update settings
   - GET /api/v1/frontpad/sync-log — Get sync history/log

### Frontend
3. **src/pages/AdminFrontpad.tsx** — Full POS Integration admin tab with:
   - Settings form (API key, affiliate ID, sync interval)
   - Test Connection button
   - Force Sync Now button
   - Last Sync Status display
   - Sync log table
4. **src/pages/Admin.tsx** — Add "POS Integration" tab to TABS array and renderContent

### Database Changes
5. Add `frontpad_id` and `photo_locked` columns to food_items model (for sync mapping and photo lock)

## Implementation Notes
- FrontPad API base URL: https://app.frontpad.ru/api/index.php
- All FrontPad API calls go through backend proxy (never expose API key to frontend)
- Photo Lock: When syncing, if `photo_locked=true` on a food item, skip image update
- Stock Control: If FrontPad product is out of stock, set `is_active=false`
- Modifiers: Map FrontPad modifiers to existing food_modifiers table
- Order mapping: product_id → frontpad product, quantity, customer_name, phone, address, comment