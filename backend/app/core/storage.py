"""Stockage local des fichiers (dev/CI) et assainissement des images (format réel, EXIF appliqué puis supprimé, ré-encodage WebP)."""
import asyncio
import io
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings
from app.core.errors import bad_request

KEY_RE = re.compile(r"^[a-z0-9][a-z0-9/_-]*\.webp$", re.I)
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 50_000_000


def _root() -> Path:
    return Path(get_settings().upload_dir).resolve()


def _resolve(key: str) -> Path:
    if not KEY_RE.match(key) or ".." in key:
        raise bad_request("INVALID_KEY")
    return _root() / key


async def put(key: str, data: bytes) -> None:
    f = _resolve(key)

    def _w() -> None:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)

    await asyncio.to_thread(_w)


async def get(key: str) -> bytes | None:
    f = _resolve(key)
    try:
        return await asyncio.to_thread(f.read_bytes)
    except FileNotFoundError:
        return None  # Silence assumé : un fichier absent se traduit par un 404 chez l'appelant.


async def delete(key: str) -> None:
    f = _resolve(key)
    await asyncio.to_thread(lambda: f.unlink(missing_ok=True))


@dataclass
class ProcessedImage:
    full: bytes
    thumb: bytes
    width: int
    height: int


def _process(data: bytes, thumb_size: tuple[int, int] = (480, 600)) -> ProcessedImage:
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise bad_request("INVALID_IMAGE", "Fichier image illisible") from None
    if fmt not in ALLOWED_FORMATS:
        raise bad_request("UNSUPPORTED_IMAGE_FORMAT", "Formats acceptés : JPEG, PNG, WebP")
    base = ImageOps.exif_transpose(img).convert("RGB")  # l'ré-encodage supprime toutes les métadonnées (GPS inclus)
    full = base.copy()
    full.thumbnail((1600, 1600))
    buf = io.BytesIO()
    full.save(buf, "WEBP", quality=82)
    thumb = ImageOps.fit(base, thumb_size)
    tbuf = io.BytesIO()
    thumb.save(tbuf, "WEBP", quality=75)
    return ProcessedImage(buf.getvalue(), tbuf.getvalue(), full.width, full.height)


async def process_image(data: bytes, thumb_size: tuple[int, int] = (480, 600)) -> ProcessedImage:
    return await asyncio.to_thread(_process, data, thumb_size)
