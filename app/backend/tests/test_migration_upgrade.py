"""Execute real Alembic upgrades on disposable databases, preserving existing data."""
from pathlib import Path
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import sqlalchemy as sa
import pytest

ROOT=Path(__file__).parents[1]


def configuration():
    config=Config(str(ROOT/'alembic.ini'))
    config.set_main_option('script_location',str(ROOT/'alembic'))
    return config


def test_all_legacy_revisions_resolve():
    scripts=ScriptDirectory.from_config(configuration())
    assert scripts.get_heads()==['dam20260929_courier_workflow']
    assert scripts.get_revision('dam20260929_courier_workflow').down_revision == 'dam20260928_operator_workflow'
    assert scripts.get_revision('dam20260928_operator_workflow').down_revision == 'pp20260927_partner_profiles'
    assert scripts.get_revision('pp20260927_partner_profiles').down_revision == 'm20260927_merge_legacy_heads'
    revisions=list(scripts.walk_revisions())
    assert len(revisions)==63
    for rev in ['r6s7t8u9v0w1','r6s7t8u9v0w1_add_partner_credentials',
                's7t8u9v0w1x2','s7t8u9v0w1x2_food_order_bonus_columns',
                'x2y3z4a5b6c7','x2y3z4a5b6c7_repair_banners_columns','a5b6c7d8e9f0']:
        assert scripts.get_revision(rev).revision==rev


def test_upgrade_existing_head_preserves_listing_and_custom_banner(tmp_path,monkeypatch):
    path=tmp_path/'upgrade.db'
    monkeypatch.setenv('DATABASE_URL','sqlite+aiosqlite:///'+path.as_posix())
    engine=sa.create_engine('sqlite:///'+path.as_posix())
    with engine.begin() as conn:
        conn.execute(sa.text('CREATE TABLE alembic_version(version_num VARCHAR(128) PRIMARY KEY)'))
        conn.execute(sa.text("INSERT INTO alembic_version VALUES('c7d8e9f0a1b2_food_rebrand')"))
        conn.execute(sa.text('CREATE TABLE real_estate(id INTEGER PRIMARY KEY,title TEXT)'))
        conn.execute(sa.text("INSERT INTO real_estate VALUES(1,'Existing listing')"))
        conn.execute(sa.text('CREATE TABLE food_settings(setting_key TEXT,setting_value TEXT)'))
        conn.execute(sa.text("INSERT INTO food_settings VALUES('hero_banner_image','https://example.test/custom.jpg')"))
        conn.execute(sa.text('CREATE TABLE food_orders(id INTEGER PRIMARY KEY, customer_name TEXT)'))
        conn.execute(sa.text("INSERT INTO food_orders VALUES(77,'Existing customer')"))
        conn.execute(sa.text('CREATE TABLE food_shifts(id INTEGER PRIMARY KEY)'))
        conn.execute(sa.text('CREATE TABLE food_order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL)'))
        conn.execute(sa.text('INSERT INTO food_order_events VALUES(1,77)'))
    command.upgrade(configuration(),'head')
    command.upgrade(configuration(),'head')
    with engine.connect() as conn:
        assert conn.scalar(sa.text('SELECT version_num FROM alembic_version'))=='dam20260929_courier_workflow'
        assert sa.inspect(conn).has_table('courier_ledger')
        assert sa.inspect(conn).has_table('courier_cash_handovers')
        assert sa.inspect(conn).has_table('courier_delivery_issues')
        assert sa.inspect(conn).has_table('business_showcases')
        assert sa.inspect(conn).has_table('food_shift_procurements')
        assert tuple(conn.execute(sa.text('SELECT id,customer_name,scheduled_for FROM food_orders')).one()) == (77,'Existing customer',None)
        assert tuple(conn.execute(sa.text('SELECT order_id,shift_id FROM food_order_events')).one()) == (77,None)
        assert tuple(conn.execute(sa.text('SELECT title,seller_type,moderation_reason FROM real_estate')).one())==('Existing listing',None,None)
        assert conn.scalar(sa.text('SELECT setting_value FROM food_settings'))=='https://example.test/custom.jpg'
    engine.dispose()


@pytest.mark.parametrize("empty_version_table", [False, True])
def test_unversioned_existing_database_is_not_replayed(tmp_path, monkeypatch, empty_version_table):
    path = tmp_path / "legacy.db"
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///" + path.as_posix())
    engine = sa.create_engine("sqlite:///" + path.as_posix())
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE real_estate(id INTEGER PRIMARY KEY, title TEXT)"))
        conn.execute(sa.text("INSERT INTO real_estate VALUES(1, 'Preserve me')"))
        if empty_version_table:
            conn.execute(sa.text("CREATE TABLE alembic_version(version_num VARCHAR(32) PRIMARY KEY)"))
    with pytest.raises(RuntimeError, match="no Alembic baseline"):
        command.upgrade(configuration(), "head")
    with engine.connect() as conn:
        assert conn.scalar(sa.text("SELECT title FROM real_estate")) == "Preserve me"
        assert sa.inspect(conn).has_table("alembic_version") == empty_version_table
        assert [c["name"] for c in sa.inspect(conn).get_columns("real_estate")] == ["id", "title"]
    engine.dispose()
