import importlib.util
from pathlib import Path
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_additive_payment_migration_twice_preserves_legacy_orders():
    path=Path(__file__).parents[1]/'alembic/versions/dam20261001_payment_lifecycle.py'
    spec=importlib.util.spec_from_file_location('payment_migration',path)
    migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine=sa.create_engine('sqlite:///:memory:')
    with engine.begin() as connection:
        connection.exec_driver_sql('CREATE TABLE food_orders (id INTEGER PRIMARY KEY, status TEXT, payment_status TEXT)')
        connection.exec_driver_sql("INSERT INTO food_orders VALUES (42, 'in_progress', 'pending')")
        for table in ('food_shifts','food_order_events','logistics_tasks'):
            connection.exec_driver_sql(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY)')
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade();migration.upgrade()
        row=connection.exec_driver_sql('SELECT id,status,payment_status,cash_given_amount FROM food_orders').one()
        assert row==(42,'in_progress','pending',None)
        assert {'food_payments','food_payment_callbacks'} <= set(sa.inspect(connection).get_table_names())
        assert 'closing_summary' in {c['name'] for c in sa.inspect(connection).get_columns('food_shifts')}
