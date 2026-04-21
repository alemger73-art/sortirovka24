"""One-time script to force-reset the admin password in the database."""
import asyncio
import bcrypt
from sqlalchemy import select, update
from core.database import db_manager
from models.admin_auth import AdminCredentials


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


async def reset_admin_password():
    await db_manager.ensure_initialized()

    if not db_manager.async_session_maker:
        print("ERROR: Database session maker unavailable.")
        return

    new_hash = hash_password("Admin123@")
    print(f"Generated new bcrypt hash for 'Admin123@'")

    async with db_manager.async_session_maker() as db:
        # Check if admin exists
        result = await db.execute(
            select(AdminCredentials).where(AdminCredentials.username == "admin")
        )
        admin = result.scalar_one_or_none()

        if admin:
            # Force update the password
            admin.password_hash = new_hash
            admin.is_active = True
            await db.commit()
            print(f"SUCCESS: Password for 'admin' has been force-reset to 'Admin123@'")
            print(f"Hash: {new_hash}")
        else:
            # Create admin account
            admin = AdminCredentials(
                username="admin",
                password_hash=new_hash,
                is_active=True,
            )
            db.add(admin)
            await db.commit()
            print(f"SUCCESS: Admin account created with password 'Admin123@'")
            print(f"Hash: {new_hash}")

        # Verify the password works
        result = await db.execute(
            select(AdminCredentials).where(AdminCredentials.username == "admin")
        )
        admin = result.scalar_one_or_none()
        if admin:
            verified = bcrypt.checkpw("Admin123@".encode("utf-8"), admin.password_hash.encode("utf-8"))
            print(f"Verification: {'PASS' if verified else 'FAIL'}")

        # Also clear any lockouts
        from models.admin_auth import AdminLoginLockout
        result = await db.execute(select(AdminLoginLockout))
        lockouts = result.scalars().all()
        for lockout in lockouts:
            await db.delete(lockout)
        await db.commit()
        print(f"Cleared {len(lockouts)} lockout entries")


if __name__ == "__main__":
    asyncio.run(reset_admin_password())