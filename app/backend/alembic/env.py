#!/usr/bin/env python
# -*- coding: utf-8 -*-
# @Desc   :

import asyncio
import os
import importlib
import pkgutil
from logging.config import fileConfig

import models
from alembic import context
from core.database import Base
from core.migration_config import migration_database_url
from sqlalchemy import pool, Column, MetaData, String, Table, inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

# Automatically import all ORM models under Models
for _, module_name, _ in pkgutil.iter_modules(models.__path__):
    importlib.import_module(f"{models.__name__}.{module_name}")

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def alembic_include_object(object, name, type_, reflected, compare_to):
    # type_ can be 'table', 'index', 'column', 'constraint'
    # ignore particular table_name
    if type_ == "table" and name in ["users", "sessions", "oidc_states"]:
        return False
    return True


async def run_migrations_online():
    connectable = create_async_engine(
        migration_database_url(os.getenv("DATABASE_URL"), config.get_main_option("sqlalchemy.url")),
        poolclass=pool.NullPool,
    )
    def migrate(connection):
        # Historical revision IDs exceed Alembic's default VARCHAR(32).
        # Widen only the bookkeeping field; never stamp or discard revisions.
        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())
        has_version = "alembic_version" in existing_tables
        recorded = connection.execute(text("SELECT version_num FROM alembic_version")).first() if has_version else None
        if existing_tables - {"alembic_version"} and not recorded:
            raise RuntimeError(
                "Existing database has no Alembic baseline. Refusing to replay historical "
                "migrations; validate a restored copy and establish a reviewed baseline first."
            )
        if not has_version:
            Table("alembic_version", MetaData(),
                  Column("version_num", String(128), primary_key=True)).create(connection)
        elif connection.dialect.name == "postgresql":
            column = next(c for c in inspector.get_columns("alembic_version") if c["name"] == "version_num")
            length = getattr(column["type"], "length", None)
            if length is not None and length < 128:
                connection.execute(text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)"))
        context.configure(connection=connection, target_metadata=target_metadata,
                          compare_type=True, compare_server_default=True,
                          include_object=alembic_include_object)
        with context.begin_transaction():
            context.run_migrations()

    try:
        async with connectable.begin() as connection:
            await connection.run_sync(migrate)
    finally:
        await connectable.dispose()


def run_migrations():
    try:
        # If there is no event loop currently, use asyncio.run directly
        loop = asyncio.get_running_loop()
        loop.create_task(run_migrations_online())
    except RuntimeError:
        asyncio.run(run_migrations_online())


run_migrations()
