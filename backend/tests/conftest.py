"""Tests d'intégration : vraie base PostgreSQL dédiée (duomatch_test), API appelée en ASGI avec cookies de session."""
import os

os.environ.setdefault("NODE_ENV", "test")
os.environ.setdefault("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", "postgresql://admin@localhost:5432/duomatch_test"))
os.environ["NODE_ENV"] = "test"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql://admin@localhost:5432/duomatch_test")
os.environ.setdefault("UPLOAD_DIR", "./uploads-test")
os.environ.setdefault("APP_URL", "http://localhost:3000")
os.environ.setdefault("API_URL", "http://localhost:4000")

import httpx
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config

from app.main import create_fastapi
from app.db.session import dispose, session_maker


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")


@pytest_asyncio.fixture(scope="session")
async def app():
    a = create_fastapi()
    async with a.router.lifespan_context(a):
        yield a


@pytest_asyncio.fixture
async def http(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers={"Origin": "http://localhost:3000"}) as c:
        yield c


@pytest_asyncio.fixture
async def db():
    async with session_maker()() as s:
        yield s
