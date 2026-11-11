"""Stockage des fichiers : pilote S3/R2, configuration modifiable par le super administrateur, secret chiffré, migration."""
import json
from pathlib import Path

import pytest
from botocore.exceptions import ClientError
from sqlalchemy import delete, select

from app.core import storage, storage_config
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import session_maker
from app.models.models import AuditLog, SystemSetting
from tests.support_c import member, set_role

SECRET = "s3cr3t-key-ABCDEF0123456789-never-leak"
ACCESS = "AKIAEXAMPLE12345678"
ENDPOINT = "https://abc123.r2.cloudflarestorage.com"
BODY = {"driver": "s3", "endpoint": ENDPOINT, "bucket": "duomatch-photos", "region": "auto", "prefix": "prod", "accessKeyId": ACCESS, "secretAccessKey": SECRET}


class FakeS3:
    def __init__(self, fail_code: str | None = None):
        self.objects: dict[str, bytes] = {}
        self.fail_code = fail_code

    def _fail(self, op):
        if self.fail_code:
            raise ClientError({"Error": {"Code": self.fail_code}}, op)

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self._fail("PutObject")
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        self._fail("GetObject")
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        data = self.objects[Key]
        return {"Body": type("B", (), {"read": lambda self_: data})()}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def get_paginator(self, name):
        fake = self
        return type("P", (), {"paginate": lambda self_, Bucket, Prefix="": iter([{"Contents": [{"Key": k} for k in fake.objects if k.startswith(Prefix)]}])})()


@pytest.fixture
def fake(monkeypatch):
    f = FakeS3()
    monkeypatch.setattr(storage, "_s3_client", lambda cfg: f)
    return f


@pytest.fixture(autouse=True)
async def clean(app, monkeypatch):
    async def wipe():
        async with session_maker()() as s:
            await s.execute(delete(SystemSetting).where(SystemSetting.key == storage_config.KEY))
            await s.commit()
        storage_config.invalidate()

    await wipe()
    yield
    await wipe()


def s3cfg(prefix="prod"):
    return storage_config.Effective(driver="s3", endpoint=ENDPOINT, bucket="b", prefix=prefix, access_key_id=ACCESS, secret=SECRET, source="db")


def use(monkeypatch, cfg):
    async def eff():
        return cfg
    monkeypatch.setattr(storage_config, "effective", eff)


async def test_aller_retour_s3_avec_prefixe(monkeypatch, fake):
    use(monkeypatch, s3cfg())
    await storage.put("photos/a1.webp", b"IMG")
    assert fake.objects == {"prod/photos/a1.webp": b"IMG"}
    assert await storage.get("photos/a1.webp") == b"IMG"
    await storage.delete("photos/a1.webp")
    assert fake.objects == {} and await storage.get("photos/a1.webp") is None


async def test_cle_invalide_refusee_en_s3(monkeypatch, fake):
    use(monkeypatch, s3cfg())
    with pytest.raises(AppError):
        await storage.put("../evil.webp", b"x")


async def test_repli_lecture_disque_pendant_la_migration(monkeypatch, fake, tmp_path):
    use(monkeypatch, s3cfg())
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    (tmp_path / "photos").mkdir()
    (tmp_path / "photos" / "old.webp").write_bytes(b"LOCAL")
    assert await storage.get("photos/old.webp") == b"LOCAL"  # pas encore dans le bucket : servie depuis le disque
    await storage.delete("photos/old.webp")  # la suppression retire aussi la copie locale
    assert not (tmp_path / "photos" / "old.webp").exists()


async def test_migration_copie_sans_supprimer(monkeypatch, fake, tmp_path):
    cfg = s3cfg()
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    (tmp_path / "photos").mkdir()
    for n in ("a", "b", "c"):
        (tmp_path / "photos" / f"{n}.webp").write_bytes(n.encode())
    fake.objects["prod/photos/a.webp"] = b"deja"  # déjà présent : ni recopié ni écrasé
    r = await storage.migrate_local(cfg)
    assert r["copied"] == 2 and r["remaining"] == 0 and r["errors"] == 0
    assert fake.objects["prod/photos/a.webp"] == b"deja" and fake.objects["prod/photos/b.webp"] == b"b"
    assert (tmp_path / "photos" / "b.webp").exists()  # rien n'est supprimé du disque
    again = await storage.migrate_local(cfg)
    assert again["copied"] == 0 and again["remaining"] == 0


async def test_migration_par_lots_limitee_par_le_temps(monkeypatch, fake, tmp_path):
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    (tmp_path / "photos").mkdir()
    (tmp_path / "photos" / "x.webp").write_bytes(b"x")
    r = await storage.migrate_local(s3cfg(), budget_seconds=-1)
    assert r["copied"] == 0 and r["remaining"] == 1


@pytest.mark.parametrize("endpoint", ["http://abc.r2.cloudflarestorage.com", "https://localhost", "https://127.0.0.1", "https://10.0.0.5",
                                      "https://169.254.169.254", "https://user:pw@abc.r2.cloudflarestorage.com", "https://abc.example.com/chemin", "ftp://x.y", "https://svc.internal"])
def test_endpoint_dangereux_refuse(endpoint):
    with pytest.raises(AppError):
        storage_config.check_endpoint(endpoint)


def test_chiffrement_secret(monkeypatch):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", "cle-de-test")
    tok = storage_config.encrypt(SECRET)
    assert SECRET not in tok and storage_config.decrypt(tok) == SECRET
    monkeypatch.setattr(get_settings(), "settings_encryption_key", "autre-cle")
    assert storage_config.decrypt(tok) is None  # clé changée : secret inutilisable, sans exception


def test_chiffrement_sans_cle_refuse(monkeypatch):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", None)
    with pytest.raises(AppError) as e:
        storage_config.encrypt("x" * 20)
    assert e.value.status == 409


async def _super(app, db):
    m = await member(app, db)
    await set_role(m.id, "SUPER_ADMIN")
    return m


async def test_acces_reserve_au_super_admin(app, db):
    m = await member(app, db)
    await set_role(m.id, "ADMIN")
    assert (await m.agent.get("/api/admin/storage")).status_code == 403
    assert (await m.agent.put("/api/admin/storage", json=BODY)).status_code == 403
    assert (await m.agent.post("/api/admin/storage/migrate")).status_code == 403
    visitor = await member(app, db)
    assert (await visitor.agent.get("/api/admin/storage")).status_code == 403


async def test_enregistrement_complet_secret_jamais_expose(app, db, monkeypatch, fake):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", "cle-de-test")
    s = await _super(app, db)
    v = (await s.agent.get("/api/admin/storage")).json()
    assert v["driver"] == "local" and v["hasSecret"] is False and v["encryptionKeyConfigured"] is True

    r = await s.agent.put("/api/admin/storage", json=BODY)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["driver"] == "s3" and out["bucket"] == "duomatch-photos" and out["hasSecret"] is True and out["source"] == "db"
    assert out["accessKeyIdMasked"].endswith(ACCESS[-4:]) and ACCESS not in r.text and SECRET not in r.text
    assert SECRET not in (await s.agent.get("/api/admin/storage")).text

    async with session_maker()() as s2:
        row = (await s2.execute(select(SystemSetting.value).where(SystemSetting.key == storage_config.KEY))).scalar_one()
        assert SECRET not in json.dumps(row) and row["secretEnc"]
        logs = (await s2.execute(select(AuditLog.metadata_).where(AuditLog.action == "storage.update", AuditLog.actorId == s.id))).scalars().all()
        assert logs and SECRET not in json.dumps(logs) and logs[-1]["secretChanged"] is True

    # la configuration enregistrée est réellement utilisée par le stockage
    await storage.put("photos/z.webp", b"ZZ")
    assert fake.objects["prod/photos/z.webp"] == b"ZZ"

    # on peut modifier sans ressaisir le secret, et revenir au disque
    r2 = await s.agent.put("/api/admin/storage", json={**BODY, "secretAccessKey": None, "bucket": "autre-bucket"})
    assert r2.status_code == 200 and r2.json()["bucket"] == "autre-bucket" and r2.json()["hasSecret"] is True
    r3 = await s.agent.put("/api/admin/storage", json={"driver": "local"})
    assert r3.status_code == 200 and r3.json()["driver"] == "local"


async def test_test_de_connexion_echoue_rien_n_est_enregistre(app, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", "cle-de-test")
    monkeypatch.setattr(storage, "_s3_client", lambda cfg: FakeS3(fail_code="AccessDenied"))
    s = await _super(app, db)
    r = await s.agent.put("/api/admin/storage", json=BODY)
    assert r.status_code == 400 and r.json()["error"]["code"] == "STORAGE_TEST_FAILED"
    assert SECRET not in r.text
    assert (await s.agent.get("/api/admin/storage")).json()["driver"] == "local"
    t = await s.agent.post("/api/admin/storage/test", json=BODY)
    assert t.status_code == 400


async def test_sans_cle_de_chiffrement_refuse_et_rien_n_est_enregistre(app, db, monkeypatch, fake):
    monkeypatch.setattr(get_settings(), "settings_encryption_key", None)
    s = await _super(app, db)
    r = await s.agent.put("/api/admin/storage", json=BODY)
    assert r.status_code == 409 and r.json()["error"]["code"] == "ENCRYPTION_KEY_MISSING"
    assert (await s.agent.get("/api/admin/storage")).json()["driver"] == "local"


async def test_validation_des_champs(app, db, fake):
    s = await _super(app, db)
    for patch, code in [({"endpoint": "http://x.y"}, "INVALID_ENDPOINT"), ({"bucket": "Mauvais Nom"}, "INVALID_BUCKET"), ({"prefix": "../x"}, "INVALID_PREFIX"),
                        ({"accessKeyId": "court"}, "INVALID_ACCESS_KEY"), ({"secretAccessKey": "trop court"}, "INVALID_SECRET"), ({"driver": "ftp"}, "INVALID_DRIVER")]:
        r = await s.agent.post("/api/admin/storage/test", json={**BODY, **patch})
        assert r.status_code == 400 and r.json()["error"]["code"] == code, (patch, r.text)
    assert (await s.agent.post("/api/admin/storage/test", json={**BODY, "inconnu": 1})).status_code in (400, 422)


async def test_migration_exige_le_mode_s3(app, db):
    s = await _super(app, db)
    r = await s.agent.post("/api/admin/storage/migrate")
    assert r.status_code == 400 and r.json()["error"]["code"] == "STORAGE_NOT_S3"


def test_bucket_des_sauvegardes_distinct_ou_repli():
    """Les sauvegardes vont dans le bucket dédié s'il est défini, sinon dans celui des photos ; un nom invalide est refusé."""
    assert s3cfg().backups_bucket == "b"
    assert storage_config.Effective(driver="s3", bucket="b", backup_bucket="b-backup").backups_bucket == "b-backup"
    assert storage_config.validate({**BODY, "backupBucket": "duomatch-backup"}, None)["backupBucket"] == "duomatch-backup"
    assert storage_config.validate(BODY, None)["backupBucket"] is None
    with pytest.raises(AppError):
        storage_config.validate({**BODY, "backupBucket": "Mauvais Nom"}, None)


async def test_probe_teste_le_bucket_demande(monkeypatch):
    seen: list[str] = []

    class Rec(FakeS3):
        def put_object(self, Bucket, Key, Body, ContentType=None):
            seen.append(Bucket)
            super().put_object(Bucket, Key, Body, ContentType)

    f = Rec()
    monkeypatch.setattr(storage, "_s3_client", lambda cfg: f)
    await storage.probe(s3cfg())
    await storage.probe(s3cfg(), "b-backup")
    assert seen == ["b", "b-backup"]


async def test_copie_automatique_sans_action_manuelle(monkeypatch, fake, tmp_path):
    """Dès que le stockage objet est actif, un passage de fond copie les photos du disque ; rien à faire en mode local ; rien n'est supprimé."""
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    (tmp_path / "photos").mkdir()
    (tmp_path / "photos" / "a.webp").write_bytes(b"a")
    use(monkeypatch, storage_config.Effective(driver="local", source="db"))
    assert await storage.auto_migrate_once() is None and fake.objects == {}  # stockage local : rien à copier
    use(monkeypatch, s3cfg())
    r = await storage.auto_migrate_once()
    assert r and r["copied"] == 1 and fake.objects["prod/photos/a.webp"] == b"a" and (tmp_path / "photos" / "a.webp").exists()
    assert (await storage.auto_migrate_once())["copied"] == 0  # idempotent


def test_bucket_sauvegarde_par_defaut_depuis_l_environnement(monkeypatch):
    """Sans valeur saisie dans l'admin, S3_BACKUP_BUCKET sert de bucket de sauvegarde : rien à saisir à la main."""
    monkeypatch.setattr(get_settings(), "s3_backup_bucket", "crushduo-backup")
    row = {"driver": "s3", "endpoint": ENDPOINT, "bucket": "crushduo-media", "accessKeyId": ACCESS}
    assert storage_config._from_row(row).backups_bucket == "crushduo-backup"
    assert storage_config._from_row({**row, "backupBucket": "autre"}).backups_bucket == "autre"  # la saisie admin l'emporte
