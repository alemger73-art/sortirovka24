"""Insert approved editorial content once; never overwrite admin edits or hiding."""
import json
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy.exc import IntegrityError
from models.partner_profiles import PartnerShowcase
from routers.partner_profiles import Profile


async def seed_partner_profiles(db):
    data = json.loads((Path(__file__).parent / "partner_profiles_seed.json").read_text(encoding="utf-8"))
    for item in data:
        profile = Profile.model_validate(item)
        if await db.get(PartnerShowcase, profile.slug) is not None:
            continue
        try:
            async with db.begin_nested():
                db.add(PartnerShowcase(slug=profile.slug, published=profile.published,
                    content=profile.model_dump(exclude={"slug", "published"}),
                    updated_at=datetime.now(timezone.utc)))
                await db.flush()
        except IntegrityError:
            # Another worker may have inserted the same approved profile.
            pass
    await db.commit()
