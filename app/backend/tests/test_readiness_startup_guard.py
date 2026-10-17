from unittest.mock import AsyncMock,MagicMock
import pytest
import container_entrypoint as entry
@pytest.mark.parametrize('environment',['production','staging'])
def test_guarded_start_verifies_without_migrations(monkeypatch,environment):
    monkeypatch.setattr(entry,'validate_runtime_safety',lambda:None)
    monkeypatch.setattr(entry,'environment_name',lambda:environment)
    monkeypatch.setenv('DATABASE_URL','postgresql://synthetic/test')
    monkeypatch.setenv('S24_SCHEMA_VERIFY_ONLY','expected')
    monkeypatch.setenv('S24_STAGING_SCHEMA_VERIFY_ONLY','expected')
    verify=AsyncMock();migrate=MagicMock();start=MagicMock()
    monkeypatch.setattr(entry,'verify_schema_revision',verify)
    monkeypatch.setattr(entry.subprocess,'run',migrate)
    monkeypatch.setattr(entry.os,'execvp',start)
    entry.main();verify.assert_awaited_once_with('expected');migrate.assert_not_called();start.assert_called_once()
def test_missing_guard_refuses_start_and_migrations(monkeypatch):
    monkeypatch.setattr(entry,'validate_runtime_safety',lambda:None)
    monkeypatch.delenv('S24_SCHEMA_VERIFY_ONLY',raising=False)
    migrate=MagicMock();start=MagicMock()
    monkeypatch.setattr(entry.subprocess,'run',migrate);monkeypatch.setattr(entry.os,'execvp',start)
    with pytest.raises(RuntimeError,match='migrations are prohibited'):entry.main()
    migrate.assert_not_called();start.assert_not_called()
