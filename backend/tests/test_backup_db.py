"""Sauvegarde de la base vers R2 : rotation, vérifications, vrai pg_dump / pg_restore si les outils PostgreSQL sont installés."""
import datetime
import os
import shutil

import pytest

from scripts import backup_db as b


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.meta: dict[str, dict] = {}
        self.lie_about_size = False

    def upload_file(self, path, bucket, key, ExtraArgs=None):  # noqa: N803
        self.objects[key] = open(path, "rb").read()
        self.meta[key] = (ExtraArgs or {}).get("Metadata", {})

    def head_object(self, Bucket, Key):  # noqa: N803
        return {"ContentLength": len(self.objects[Key]) + (1 if self.lie_about_size else 0)}

    def list_objects_v2(self, Bucket, Prefix, **_):  # noqa: N803
        return {"Contents": [{"Key": k} for k in sorted(self.objects) if k.startswith(Prefix)], "IsTruncated": False}

    def delete_objects(self, Bucket, Delete):  # noqa: N803
        for o in Delete["Objects"]:
            self.objects.pop(o["Key"], None)


def keys_for(days: int, end=datetime.datetime(2026, 11, 11, 2, 0, 0)):
    return [b.PREFIX + b.backup_name(end - datetime.timedelta(days=i)) for i in range(days)]


def test_rotation_7_jours_4_semaines_6_mois():
    keys = keys_for(400)
    kept = b.to_keep(keys)
    dates = sorted(b.parse_date(k) for k in kept)
    assert kept >= set(keys[:7])  # les 7 derniers jours sont tous là
    assert len(kept) <= 7 + 4 + 6 and len(kept) >= 7 + 3  # sans dépasser 17 ; des dimanches et des mois plus anciens sont conservés
    assert any(d < datetime.datetime(2026, 10, 1) for d in dates)  # remontent au-delà d'un mois
    assert keys[399] not in kept and keys[300] not in kept  # les très anciennes disparaissent


def test_rotation_ne_descend_jamais_sous_trois():
    assert b.to_keep(keys_for(1)) == set(keys_for(1))
    assert len(b.to_keep(keys_for(2))) == 2
    # Trois sauvegardes le même jour : les 3 plus récentes sont gardées quand même.
    same_day = [b.PREFIX + b.backup_name(datetime.datetime(2026, 11, 11, h)) for h in (1, 2, 3)]
    assert b.to_keep(same_day) == set(same_day)


def fake_dump(_url, path):
    path.write_bytes(os.urandom(4096))


def test_envoi_verification_et_rotation():
    s3 = FakeS3()
    now = datetime.datetime(2026, 11, 11, 2, 0, 0)
    s3.objects = {f"crushduo/{k}": b"x" * 10 for k in keys_for(30, end=now - datetime.timedelta(days=1))}
    s3.objects["crushduo/photos/abc.webp"] = b"photo"  # un fichier d'un autre usage n'est jamais touché
    r = b.run(s3, "bucket", "crushduo", "postgresql://x", now=now, dump_fn=fake_dump)
    assert r["key"] == "crushduo/backups/db/duomatch-20261111-020000.dump" and r["bytes"] == 4096 and len(r["sha256"]) == 64
    assert s3.meta[r["key"]]["sha256"] == r["sha256"]
    assert "crushduo/photos/abc.webp" in s3.objects
    assert r["deleted"] > 0 and r["kept"] <= 17 and r["key"] in s3.objects  # la nouvelle sauvegarde est toujours conservée


def test_taille_differente_cote_stockage_refusee():
    s3 = FakeS3()
    s3.lie_about_size = True
    with pytest.raises(RuntimeError, match="taille différente"):
        b.run(s3, "bucket", "", "postgresql://x", now=datetime.datetime(2026, 11, 11), dump_fn=fake_dump)


@pytest.mark.skipif(not (shutil.which("pg_dump") and shutil.which("pg_restore")), reason="outils PostgreSQL absents")
def test_vrai_pg_dump_relisible(tmp_path):
    p = tmp_path / "db.dump"
    b.dump(os.environ["DATABASE_URL"], p)  # lève une exception si le fichier est trop petit ou illisible
    assert p.stat().st_size >= b.MIN_BYTES


async def test_premiere_sauvegarde_automatique(monkeypatch):
    """Stockage objet actif et aucune sauvegarde jamais tentée : la boucle en lance une seule, sans clic."""
    import asyncio

    from app.core import backups, storage_config

    async def eff():
        return storage_config.Effective(driver="s3", bucket="b")

    calls = []

    async def fake_run(trigger, url, dump_fn=None):
        calls.append(trigger)
        return {"ok": True}

    async def no_sleep(_):
        return None

    monkeypatch.setattr(storage_config, "effective", eff)
    monkeypatch.setattr(backups, "run_and_record", fake_run)
    monkeypatch.setattr(backups.shutil, "which", lambda _: "/usr/bin/pg_dump")
    monkeypatch.setattr(asyncio, "sleep", no_sleep)

    async def empty(_db):
        return {}

    monkeypatch.setattr(backups, "get_status", empty)
    await asyncio.wait_for(backups.first_backup_loop(), 5)
    assert calls == ["auto"]
