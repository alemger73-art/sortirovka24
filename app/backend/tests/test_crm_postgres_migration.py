"""Run real PostgreSQL Alembic migrations on a newly created LOCAL database only."""
import asyncio
import os
from pathlib import Path
import subprocess
import sys
import uuid
import pytest
from sqlalchemy.engine import make_url

@pytest.mark.skipif(not os.getenv('LOYALTY_TEST_POSTGRES_URL'),reason='requires disposable local PostgreSQL')
def test_crm_postgres_upgrade_preserves_identity_and_immutable_ledger():
    import asyncpg
    url=make_url(os.environ['LOYALTY_TEST_POSTGRES_URL'])
    assert url.host in ('localhost','127.0.0.1') and url.database=='crm_test'
    name='crm_migrate_'+uuid.uuid4().hex
    admin=url.set(drivername='postgresql',database='postgres').render_as_string(hide_password=False)
    target=url.set(drivername='postgresql',database=name).render_as_string(hide_password=False)
    async def prepare():
        conn=await asyncpg.connect(admin)
        await conn.execute(f'CREATE DATABASE "{name}"');await conn.close()
        conn=await asyncpg.connect(target)
        await conn.execute('''CREATE TABLE alembic_version(version_num VARCHAR(128) PRIMARY KEY);
INSERT INTO alembic_version VALUES('dam20261001_payment_lifecycle');
CREATE TABLE users(id VARCHAR(255) PRIMARY KEY,phone TEXT,name TEXT,bonus_balance FLOAT);
CREATE TABLE food_restaurants(id INTEGER PRIMARY KEY,name TEXT,merchant_key TEXT);
CREATE TABLE food_orders(id SERIAL PRIMARY KEY,customer_name TEXT,customer_phone TEXT,restaurant_id INTEGER,restaurant_name TEXT,status TEXT,payment_status TEXT,order_source TEXT);
CREATE TABLE bonuses(id SERIAL PRIMARY KEY,user_id VARCHAR(255) NOT NULL,points FLOAT,reason TEXT,created_at TIMESTAMP WITH TIME ZONE);
CREATE TABLE user_notifications(id SERIAL PRIMARY KEY);
CREATE TABLE phone_verifications(phone TEXT,is_verified BOOLEAN);
CREATE TABLE food_items(id INTEGER PRIMARY KEY,restaurant_id INTEGER);
CREATE TABLE modifier_groups(id INTEGER PRIMARY KEY);
CREATE TABLE modifier_options(id INTEGER PRIMARY KEY,group_id INTEGER);
CREATE TABLE item_modifier_groups(id INTEGER PRIMARY KEY,food_item_id INTEGER,modifier_group_id INTEGER);
INSERT INTO food_items VALUES(1,1);
INSERT INTO modifier_groups VALUES(1),(2);
INSERT INTO modifier_options VALUES(1,1);
INSERT INTO item_modifier_groups VALUES(1,1,1);
INSERT INTO users VALUES('old','87000000000','Preserved',500),('duplicate-a','87000000001','A',0),('duplicate-b','+77000000001','B',0);
INSERT INTO phone_verifications VALUES('+77000000000',true),('+77000000001',true);
INSERT INTO food_restaurants VALUES(1,'DAM ALEM 2.0','dam_alem');
INSERT INTO food_orders VALUES(77,'Preserved','+77000000000',1,'DAM ALEM 2.0','done','paid','app');
INSERT INTO food_orders VALUES(78,'Guest without account','+77000000002',1,'DAM ALEM 2.0','new','pending','operator');
INSERT INTO bonuses(user_id,points,reason) VALUES('old',500,'Legacy balance');''')
        await conn.close()
    async def verify():
        conn=await asyncpg.connect(target)
        assert await conn.fetchval('SELECT version_num FROM alembic_version')=='dam20261005_menu_configuration'
        assert await conn.fetchval("SELECT bonus_balance FROM users WHERE id='old'")==500
        assert await conn.fetchval('SELECT points FROM bonuses WHERE id=1')==500
        assert await conn.fetchval('SELECT max(bonus_balance) FROM bonus_members')==0
        assert await conn.fetchval('SELECT sum(legacy_welcome) FROM bonus_members')==1
        assert await conn.fetchval("SELECT count(*) FROM customers WHERE normalized_phone='+77000000002' AND user_id IS NULL")==1
        order=await conn.fetchrow('SELECT id,customer_name,business_id,customer_id FROM food_orders WHERE id=77')
        assert order['id']==77 and order['customer_name']=='Preserved' and order['business_id']=='dam_alem'
        assert await conn.fetchval('SELECT user_id FROM customers WHERE id=$1',order['customer_id'])=='old'
        ambiguous=await conn.fetchrow("SELECT user_id,state FROM customers WHERE normalized_phone='+77000000001'")
        assert ambiguous['user_id'] is None and ambiguous['state']=='REVIEW'
        assert set(await conn.fetch('SELECT kind FROM customer_migration_issues'))
        assert await conn.fetchval('SELECT latitude FROM business_locations') is None
        for sql in ('UPDATE bonuses SET points=0 WHERE id=1','DELETE FROM bonuses WHERE id=1'):
            with pytest.raises(asyncpg.PostgresError,match='append-only'):
                await conn.execute(sql)
        assert await conn.fetchval('SELECT points FROM bonuses WHERE id=1')==500
        assert await conn.fetchval('SELECT business_id FROM food_items')=='dam_alem'
        assert await conn.fetchval("SELECT count(*) FROM modifier_groups WHERE business_id='dam_alem'")==2
        assert await conn.fetchval('SELECT business_id FROM modifier_options')=='dam_alem'
        assert await conn.fetchval('SELECT modifiers_enabled FROM food_items') is True
        await conn.close()
    async def cleanup():
        conn=await asyncpg.connect(admin)
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)');await conn.close()
    try:
        asyncio.run(prepare())
        for _ in range(2):
            result=subprocess.run([sys.executable,'-X','utf8','-m','alembic','upgrade','head'],cwd=Path(__file__).parents[1],env={**os.environ,'DATABASE_URL':target,'EXTERNAL_SIDE_EFFECTS':'disabled'},capture_output=True,text=True,encoding='utf-8')
            assert result.returncode==0,result.stderr.replace(target,'<local test database>')
        asyncio.run(verify())
    finally:
        asyncio.run(cleanup())
