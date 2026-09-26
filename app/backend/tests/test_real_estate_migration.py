"""The additive migration preserves existing listings and can be rerun safely."""
import importlib.util
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
import sqlalchemy as sa


def test_seller_columns_preserve_legacy_rows():
    path=Path(__file__).parents[1]/'alembic'/'versions'/'re20260927_seller_details.py'
    spec=importlib.util.spec_from_file_location('seller_migration',path)
    migration=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine=sa.create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE real_estate (id INTEGER PRIMARY KEY, title TEXT)'))
        connection.execute(sa.text("INSERT INTO real_estate VALUES (1, 'Existing listing')"))
        migration.op=Operations(MigrationContext.configure(connection))
        migration.upgrade()
        migration.upgrade()
        row=connection.execute(sa.text('SELECT title,seller_type,agency_name,commission,moderation_reason FROM real_estate')).one()
        assert tuple(row)==('Existing listing',None,None,None,None)
    engine.dispose()
