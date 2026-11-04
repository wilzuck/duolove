"""Alembic en mode synchrone (psycopg2) : les migrations multi-instructions y sont fiables."""
from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.models.models import Base

target_metadata = Base.metadata


def run() -> None:
    engine = create_engine(get_settings().sync_url, poolclass=pool.NullPool)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run()
