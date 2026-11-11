"""Page admin « Sauvegardes » : état, lancement à la demande, téléchargement protégé (mot de passe, journal d'audit), alerte en cas d'échec."""
import asyncio
import datetime
import os
from types import SimpleNamespace

from sqlalchemy import delete

from app.core import backups
from app.db.session import session_maker
from app.models.models import SystemSetting
from tests.helpers import PASSWORD
from tests.support_c import admin, member


class FakeS3:
    def __init__(self):
        self.objects: dict[str, int] = {}

    def upload_file(self, path, bucket, key, ExtraArgs=None):  # noqa: N803
        self.objects[key] = os.path.getsize(path)

    def head_object(self, Bucket, Key):  # noqa: N803
        return {"ContentLength": self.objects[Key]}

    def list_objects_v2(self, Bucket, Prefix, **_):  # noqa: N803
        return {"Contents": [{"Key": k, "Size": n} for k, n in sorted(self.objects.items()) if k.startswith(Prefix)], "IsTruncated": False}

    def delete_objects(self, Bucket, Delete):  # noqa: N803
        for o in Delete["Objects"]:
            self.objects.pop(o["Key"], None)

    def generate_presigned_url(self, op, Params, ExpiresIn):  # noqa: N803
        return f"https://r2.example/{Params['Key']}?expires={ExpiresIn}"


async def reset():
    async with session_maker()() as s:
        await s.execute(delete(SystemSetting).where(SystemSetting.key == backups.STATUS_KEY))
        await s.commit()


def good_dump(_url, path):
    path.write_bytes(os.urandom(4096))


def bad_dump(_url, _path):
    raise RuntimeError("pg_dump a échoué (test)")


async def wait_done(a, tries=40):
    for _ in range(tries):
        r = (await a.agent.get("/api/admin/backups")).json()
        if not r["status"]["running"] and r["status"]["last"]:
            return r
        await asyncio.sleep(0.15)
    raise AssertionError(f"la sauvegarde ne se termine pas : {r}")


async def test_sauvegardes_admin(app, db, monkeypatch):
    await reset()
    a, user = await admin(app, db), await member(app, db)
    assert (await user.agent.get("/api/admin/backups")).status_code == 403
    assert (await user.agent.post("/api/admin/backups/run")).status_code == 403
    # Stockage objet absent (disque local) : rien n'est sauvegardé, l'état le dit.
    assert (await a.agent.get("/api/admin/backups")).json()["configured"] is False
    run = await a.agent.post("/api/admin/backups/run")
    assert run.status_code == 409 and run.json()["error"]["code"] == "STORAGE_NOT_CONFIGURED"

    fake = FakeS3()

    async def fake_client():
        return fake, SimpleNamespace(bucket="b", prefix="crushduo")

    monkeypatch.setattr(backups, "client_and_cfg", fake_client)
    monkeypatch.setattr(backups, "dump", good_dump)
    monkeypatch.setattr("app.api.admin_backups.shutil.which", lambda _n: "/usr/bin/pg_dump")
    first = (await a.agent.get("/api/admin/backups")).json()
    assert first["configured"] is True and first["items"] == [] and first["status"]["stale"] is True  # aucune sauvegarde : alerte

    assert (await a.agent.post("/api/admin/backups/run")).status_code == 202
    done = await wait_done(a)
    assert done["status"]["last"]["ok"] is True and done["status"]["stale"] is False and len(done["items"]) == 1
    item = done["items"][0]
    assert item["key"].startswith("crushduo/backups/db/duomatch-") and item["bytes"] == 4096

    # Téléchargement : mot de passe obligatoire, clé connue seulement, journalisé.
    bad = await a.agent.post("/api/admin/backups/download", json={"key": item["key"], "password": "mauvais"})
    assert bad.status_code == 401
    unknown = await a.agent.post("/api/admin/backups/download", json={"key": "crushduo/photos/x.webp", "password": PASSWORD})
    assert unknown.status_code == 400 and unknown.json()["error"]["code"] == "BACKUP_NOT_FOUND"
    assert (await user.agent.post("/api/admin/backups/download", json={"key": item["key"], "password": PASSWORD})).status_code == 403
    ok = await a.agent.post("/api/admin/backups/download", json={"key": item["key"], "password": PASSWORD})
    assert ok.status_code == 200 and ok.json() == {"url": f"https://r2.example/{item['key']}?expires=300", "expiresIn": 300}
    logs = (await a.agent.get("/api/admin/audit-logs?limit=50")).json()["items"]
    actions = [x["action"] for x in logs]
    assert "backup.run" in actions and "backup.download" in actions and "backup.download.denied" in actions

    # Échec : enregistré, l'ancienne sauvegarde reste « dernière réussie », les administrateurs sont prévenus (envoi simulé : la base de test compte des centaines d'administrateurs).
    alerts: list[str] = []

    async def fake_notify(error):
        alerts.append(error)

    monkeypatch.setattr(backups, "notify_failure", fake_notify)
    monkeypatch.setattr(backups, "dump", bad_dump)
    assert (await a.agent.post("/api/admin/backups/run")).status_code == 202
    failed = await wait_done(a)
    assert failed["status"]["last"]["ok"] is False and "pg_dump a échoué" in failed["status"]["last"]["error"]
    assert failed["status"]["lastOk"]["key"] == item["key"] and len(failed["items"]) == 1
    for _ in range(40):
        if alerts:
            break
        await asyncio.sleep(0.1)
    assert alerts and "pg_dump a échoué" in alerts[0]
    await reset()


def test_etat_obsolete_apres_26_heures():
    from app.api.admin_backups import _view_status

    old = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=30)).isoformat()
    assert _view_status({"lastOk": {"at": old}})["stale"] is True
    assert _view_status({})["stale"] is True
