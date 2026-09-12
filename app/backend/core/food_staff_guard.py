from fastapi import Request, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.partner_guard import require_food_panel_access
from models.partner_auth import PartnerCredentials

async def food_staff(request: Request, db: AsyncSession = Depends(get_db)):
    claims = require_food_panel_access(request)
    if claims.get('role') == 'admin':
        return {**claims, 'access_role': 'owner'}
    row = await db.get(PartnerCredentials, claims.get('partner_id')) if claims.get('partner_id') else None
    if not row or not row.is_active or row.partner_type != 'dam_alem':
        raise HTTPException(403, 'Войдите в действующую учётную запись DAM ALEM')
    if row.access_role not in (None, 'owner', 'operator'):
        raise HTTPException(403, 'Проверьте роль сотрудника у владельца')
    return {**claims, 'access_role': row.access_role or 'owner', 'display_name': row.display_name or row.email or row.phone, 'staff_id': row.id}

async def food_owner(claims=Depends(food_staff)):
    if claims['access_role'] != 'owner':
        raise HTTPException(403, 'Раздел доступен только владельцу')
    return claims
