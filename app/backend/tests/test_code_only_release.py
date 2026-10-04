from unittest.mock import AsyncMock, MagicMock
import pytest
import container_entrypoint as entry


@pytest.mark.parametrize('matches', [True, False])
@pytest.mark.asyncio
async def test_schema_verification_is_read_only_and_rejects_drift(monkeypatch, matches):
    import asyncpg
    connection = AsyncMock()
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock()
    transaction.__aexit__ = AsyncMock(return_value=False)
    connection.transaction = MagicMock(return_value=transaction)
    connection.fetch.return_value = [{'version_num': 'expected' if matches else 'unexpected'}]
    monkeypatch.setattr(asyncpg, 'connect', AsyncMock(return_value=connection))
    monkeypatch.setenv('DATABASE_URL', 'postgresql://local-test/database')
    if matches:
        await entry.verify_schema_revision('expected')
    else:
        with pytest.raises(RuntimeError, match='no migrations executed'):
            await entry.verify_schema_revision('expected')
    connection.transaction.assert_called_once_with(readonly=True)
    connection.execute.assert_not_called()
    connection.close.assert_awaited_once()


def test_code_only_production_start_never_calls_alembic(monkeypatch):
    monkeypatch.setattr(entry, 'validate_runtime_safety', lambda: None)
    monkeypatch.setattr(entry, 'environment_name', lambda: 'production')
    monkeypatch.setenv('DATABASE_URL', 'postgresql://local-test/database')
    monkeypatch.setenv('S24_SCHEMA_VERIFY_ONLY', 'expected')
    verified = AsyncMock()
    monkeypatch.setattr(entry, 'verify_schema_revision', verified)
    migration = MagicMock()
    monkeypatch.setattr(entry.subprocess, 'run', migration)
    monkeypatch.setattr(entry.os, 'execvp', MagicMock())
    entry.main()
    verified.assert_awaited_once_with('expected')
    migration.assert_not_called()

@pytest.mark.asyncio
async def test_code_only_release_disables_runtime_schema_repair(monkeypatch):
    from core.database import DatabaseManager
    monkeypatch.setenv('S24_SCHEMA_VERIFY_ONLY', 'expected')
    manager = DatabaseManager()
    manager.check_and_repair_existing_tables = AsyncMock()
    manager.engine = MagicMock()
    await manager.create_tables()
    manager.check_and_repair_existing_tables.assert_not_called()
    manager.engine.begin.assert_not_called()
    assert manager._initialized


def test_container_runs_guarded_entrypoint():
    from pathlib import Path
    dockerfile = (Path(__file__).parents[3] / 'Dockerfile').read_text(encoding='utf-8-sig')
    assert 'CMD ["python", "container_entrypoint.py"]' in dockerfile
    assert 'alembic upgrade head' not in dockerfile


def test_railway_override_runs_guarded_entrypoint():
    import json
    from pathlib import Path
    config = json.loads((Path(__file__).parents[3] / 'railway.json').read_text(encoding='utf-8-sig'))
    assert config['deploy']['startCommand'] == 'python container_entrypoint.py'
