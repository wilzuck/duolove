"""Copie nocturne des photos vers le bucket de sauvegarde : incrémentale, côté serveur, photos supprimées gardées 30 jours puis effacées."""
import datetime
from types import SimpleNamespace

import pytest

from app.core import backups as bk


class Buckets:
    """Faux S3 à plusieurs buckets : list_objects_v2 (avec Size), copy_object, put_object, delete_objects."""

    def __init__(self):
        self.b: dict[str, dict[str, bytes]] = {}
        self.copies = 0

    def put(self, bucket, key, data=b"x"):
        self.b.setdefault(bucket, {})[key] = data

    def list_objects_v2(self, Bucket, Prefix, **_):  # noqa: N803
        objs = self.b.get(Bucket, {})
        return {"Contents": [{"Key": k, "Size": len(v)} for k, v in sorted(objs.items()) if k.startswith(Prefix)], "IsTruncated": False}

    def copy_object(self, Bucket, Key, CopySource):  # noqa: N803
        self.copies += 1
        self.put(Bucket, Key, self.b[CopySource["Bucket"]][CopySource["Key"]])

    def put_object(self, Bucket, Key, Body):  # noqa: N803
        self.put(Bucket, Key, Body)

    def delete_objects(self, Bucket, Delete):  # noqa: N803
        for o in Delete["Objects"]:
            self.b.get(Bucket, {}).pop(o["Key"], None)


DAY = datetime.datetime(2026, 11, 15, 2, 0, 0)


def test_copie_incrementale_sans_toucher_aux_sauvegardes():
    s3 = Buckets()
    s3.put("photos", "crushduo/photos/a.webp", b"aaa")
    s3.put("photos", "crushduo/photos/a_t.webp", b"a")
    s3.put("photos", "crushduo/healthcheck/x.webp")  # fichier de test du stockage : jamais copié
    r = bk.copy_photos(s3, "photos", "backup", "crushduo", DAY)
    assert r == {"files": 2, "copied": 2, "pendingDeletion": 0, "newlyDeleted": 0, "purged": 0}
    assert s3.b["backup"]["crushduo/backups/photos/photos/a.webp"] == b"aaa"
    assert not any("healthcheck" in k for k in s3.b["backup"])
    # Deuxième nuit : rien n'a changé, rien n'est recopié ; un nouveau fichier seulement est copié.
    s3.put("photos", "crushduo/photos/b.webp", b"bb")
    assert bk.copy_photos(s3, "photos", "backup", "crushduo", DAY)["copied"] == 1 and s3.copies == 3


def test_meme_bucket_ne_copie_pas_les_sauvegardes_elles_memes():
    s3 = Buckets()
    s3.put("one", "photos/a.webp")
    s3.put("one", "backups/db/duomatch-20261114-020000.dump", b"dump")
    r = bk.copy_photos(s3, "one", "one", "", DAY)
    assert r["files"] == 1 and "backups/photos/photos/a.webp" in s3.b["one"]
    assert bk.copy_photos(s3, "one", "one", "", DAY)["copied"] == 0  # la copie elle-même n'est jamais prise pour une photo


def test_photo_supprimee_gardee_30_jours_puis_effacee():
    s3 = Buckets()
    s3.put("photos", "photos/a.webp")
    s3.put("photos", "photos/b.webp")
    bk.copy_photos(s3, "photos", "backup", "", DAY)
    del s3.b["photos"]["photos/a.webp"]  # le membre retire sa photo
    r = bk.copy_photos(s3, "photos", "backup", "", DAY)
    assert (r["newlyDeleted"], r["pendingDeletion"], r["purged"]) == (1, 1, 0)
    assert "backups/photos/photos/a.webp" in s3.b["backup"]  # encore restaurable
    r = bk.copy_photos(s3, "photos", "backup", "", DAY + datetime.timedelta(days=29))
    assert (r["newlyDeleted"], r["purged"]) == (0, 0)
    r = bk.copy_photos(s3, "photos", "backup", "", DAY + datetime.timedelta(days=30))
    assert r["purged"] == 1 and r["pendingDeletion"] == 0
    assert set(s3.b["backup"]) == {"backups/photos/photos/b.webp"}  # copie et marque effacées


def test_photo_revenue_avant_la_fin_du_delai():
    s3 = Buckets()
    s3.put("photos", "photos/a.webp")
    bk.copy_photos(s3, "photos", "backup", "", DAY)
    data = s3.b["photos"].pop("photos/a.webp")
    bk.copy_photos(s3, "photos", "backup", "", DAY)
    s3.put("photos", "photos/a.webp", data)  # restaurée dans la source
    bk.copy_photos(s3, "photos", "backup", "", DAY + datetime.timedelta(days=1))
    assert not any(k.startswith("backups/photos-deleted/") for k in s3.b["backup"])
    assert bk.copy_photos(s3, "photos", "backup", "", DAY + datetime.timedelta(days=40))["purged"] == 0


@pytest.mark.asyncio
async def test_echec_des_photos_n_annule_pas_la_base_mais_est_signale(monkeypatch):
    saved, alerts = {}, []
    cfg = SimpleNamespace(bucket="photos", backups_bucket="backup", prefix="")

    async def client_and_cfg():
        return object(), cfg

    async def mark_running(_trigger):
        return {}

    async def set_status(v):
        saved.update(v)

    async def notify(msg):
        alerts.append(msg)

    def boom(*_a, **_k):
        raise RuntimeError("R2 indisponible")

    monkeypatch.setattr(bk, "client_and_cfg", client_and_cfg)
    monkeypatch.setattr(bk, "mark_running", mark_running)
    monkeypatch.setattr(bk, "set_status", set_status)
    monkeypatch.setattr(bk, "notify_failure", notify)
    monkeypatch.setattr(bk, "run", lambda *a, **k: {"key": "backups/db/x.dump", "bytes": 4096})
    monkeypatch.setattr(bk, "copy_photos", boom)
    last = await bk.run_and_record("nightly", "postgresql://x")
    assert last["ok"] is True and last["photos"] == {"error": "R2 indisponible"}
    assert saved["lastOk"]["key"] == "backups/db/x.dump"
    assert alerts == ["copie des photos : R2 indisponible"]
