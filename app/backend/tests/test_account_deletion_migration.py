"""Execute only the new migration against a disposable in-memory database."""
import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text


def test_upgrade_and_downgrade_preserve_existing_users(monkeypatch):
    root = Path(__file__).parents[1]
    spec = importlib.util.spec_from_file_location("deletion_migration", root / "alembic/versions/delete20261016_requests.py")
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id VARCHAR(255) PRIMARY KEY, name TEXT)"))
        connection.execute(text("INSERT INTO users VALUES ('test-existing', 'Keep this user')"))
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("account_deletion_requests")}
        assert {"id", "user_id", "status", "due_at", "retained_records", "processing_evidence"} <= columns
        assert connection.scalar(text("SELECT name FROM users")) == "Keep this user"
        migration.downgrade()
        assert not inspect(connection).has_table("account_deletion_requests")
        assert connection.scalar(text("SELECT name FROM users")) == "Keep this user"
    engine.dispose()


def test_revision_is_resolvable_from_current_chain():
    root = Path(__file__).parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_revision("delete20261016_requests").down_revision == "dam20261006_pwa_preferences"
    assert "delete20261016_requests" in scripts.get_heads()
