import importlib.util
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa


def test_rebrand_keeps_identity_custom_text_and_order_history():
    path = Path(__file__).parents[1] / 'alembic/versions/c7d8e9f0a1b2_food_rebrand.py'
    spec = importlib.util.spec_from_file_location('rebrand', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.rename('Промокод DAMALEM10 — Алем Фуд') == 'Промокод DAMALEM10 — DAM ALEM 2.0'
    engine = sa.create_engine('sqlite://')
    with engine.begin() as conn:
        conn.exec_driver_sql('CREATE TABLE food_restaurants (id INTEGER PRIMARY KEY, name TEXT, description TEXT)')
        conn.exec_driver_sql("INSERT INTO food_restaurants VALUES (7, 'Алем Фуд', 'Доставка еды №1 в Сортировке'), (8, 'Другой ресторан', 'Своя кухня')")
        conn.exec_driver_sql('CREATE TABLE food_settings (id INTEGER PRIMARY KEY, setting_key TEXT, setting_value TEXT)')
        conn.exec_driver_sql("INSERT INTO food_settings VALUES (1, 'hero_banner_title', 'Алем Фуд'), (2, 'hero_banner_subtitle', 'Горячая еда с доставкой · 35–45 мин · Сортировка'), (3, 'whatsapp_number', '+77000000000')")
        conn.exec_driver_sql('CREATE TABLE food_orders (id INTEGER PRIMARY KEY, restaurant_name TEXT)')
        conn.exec_driver_sql("INSERT INTO food_orders VALUES (1, 'Алем Фуд')")
        with patch.object(migration.op, 'get_bind', return_value=conn):
            migration.upgrade()
            migration.upgrade()
        assert conn.exec_driver_sql('SELECT * FROM food_restaurants ORDER BY id').all() == [(7, 'DAM ALEM 2.0', 'Доставка еды по Сортировке №1'), (8, 'Другой ресторан', 'Своя кухня')]
        assert conn.exec_driver_sql('SELECT setting_value FROM food_settings ORDER BY id').scalars().all() == ['DAM ALEM 2.0', 'Доставка еды по Сортировке №1', '+77000000000']
        assert conn.exec_driver_sql('SELECT restaurant_name FROM food_orders').scalar() == 'Алем Фуд'
