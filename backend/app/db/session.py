from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_engine = None
_maker: async_sessionmaker[AsyncSession] | None = None


def engine():
    global _engine, _maker
    if _engine is None:
        _engine = create_async_engine(get_settings().async_url, pool_size=10, max_overflow=10, pool_pre_ping=True)
        _maker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def session_maker() -> async_sessionmaker[AsyncSession]:
    engine()
    assert _maker is not None
    return _maker


async def get_db() -> AsyncIterator[AsyncSession]:
    """Une session par requête ; commit explicite par les services (jamais implicite)."""
    async with session_maker()() as session:
        yield session


async def dispose() -> None:
    global _engine, _maker
    if _engine is not None:
        await _engine.dispose()
    _engine = _maker = None
