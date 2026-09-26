import pytest
from core.migration_config import migration_database_url


def test_environment_url_takes_precedence():
    assert migration_database_url('postgres://u:p@localhost/db', '""') == 'postgresql+asyncpg://u:p@localhost/db'


def test_async_options_preserve_tls():
    result=migration_database_url('postgresql://u:p@localhost/db?sslmode=require&channel_binding=require', None)
    assert 'ssl=require' in result and 'channel_binding' not in result and 'sslmode' not in result


def test_sqlite_programmatic_test_configuration():
    assert migration_database_url(None,'sqlite:///local.db')=='sqlite+aiosqlite:///local.db'


@pytest.mark.parametrize('value',[None,'','""'])
def test_missing_url_fails_closed(value):
    with pytest.raises(RuntimeError,match='DATABASE_URL'):
        migration_database_url(None,value)


def test_invalid_url_does_not_expose_credentials():
    with pytest.raises(RuntimeError) as error:
        migration_database_url('secret-password',None)
    assert 'secret-password' not in str(error.value)
