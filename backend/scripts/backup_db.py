"""Sauvegarde nocturne de la base PostgreSQL vers le stockage objet (Cloudflare R2), jamais sur le disque du serveur.

Usage (cron Railway, voir docker/railway.backup.json) :  python -m scripts.backup_db
         python -m scripts.backup_db --list          liste les sauvegardes
         python -m scripts.backup_db --download LATEST|<clé> [dossier]   télécharge une sauvegarde pour la restaurer (docs/BACKUP.md)

Déroulé : pg_dump (format « custom », compressé) → contrôle de lisibilité (pg_restore --list) → envoi → vérification de la taille côté R2 → rotation.
Rotation : on garde les 7 dernières sauvegardes quotidiennes, 4 hebdomadaires (dimanche) et 6 mensuelles (le 1er), et JAMAIS moins de 3 sauvegardes.
Sortie non nulle au moindre échec (Railway marque l'exécution en échec). Les fichiers de sauvegarde contiennent toutes les données personnelles : le bucket doit rester privé."""
from __future__ import annotations

import datetime
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PREFIX = "backups/db/"
NAME_RE = re.compile(r"duomatch-(\d{8})-(\d{6})\.dump$")
KEEP_DAILY, KEEP_WEEKLY, KEEP_MONTHLY, KEEP_MIN = 7, 4, 6, 3
MIN_BYTES = 2048  # une sauvegarde plus petite est forcément vide ou tronquée


def backup_name(now: datetime.datetime) -> str:
    return f"duomatch-{now:%Y%m%d-%H%M%S}.dump"


def parse_date(key: str) -> datetime.datetime | None:
    m = NAME_RE.search(key)
    return datetime.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S") if m else None


def to_keep(keys: list[str]) -> set[str]:
    """Clés à conserver : 7 jours (la plus récente de chaque jour), 4 dimanches, 6 mois (le 1er du mois ou, à défaut, la première du mois), et au moins les 3 plus récentes."""
    dated = sorted(((d, k) for k in keys if (d := parse_date(k))), reverse=True)
    keep: set[str] = {k for _, k in dated[:KEEP_MIN]}
    seen: dict[str, set] = {"d": set(), "w": set(), "m": set()}
    for d, k in dated:  # du plus récent au plus ancien : la première rencontrée de chaque jour / semaine / mois est la plus récente
        day, week, month = d.date().isoformat(), f"{d.isocalendar().year}-{d.isocalendar().week}", f"{d.year}-{d.month}"
        if day not in seen["d"] and len(seen["d"]) < KEEP_DAILY:
            seen["d"].add(day); keep.add(k)
        if week not in seen["w"] and len(seen["w"]) < KEEP_WEEKLY:
            seen["w"].add(week); keep.add(k)
        if month not in seen["m"] and len(seen["m"]) < KEEP_MONTHLY:
            seen["m"].add(month); keep.add(k)
    return keep


def dump(database_url: str, path: Path) -> None:
    """pg_dump au format custom (compressé), sans propriétaire ni droits : restaurable dans n'importe quelle base."""
    url = database_url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")
    subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--file", str(path), url], check=True, capture_output=True, text=True)
    if path.stat().st_size < MIN_BYTES:
        raise RuntimeError(f"sauvegarde suspecte : {path.stat().st_size} octets")
    subprocess.run(["pg_restore", "--list", str(path)], check=True, capture_output=True, text=True)  # le fichier doit être relisible


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def list_keys(client, bucket: str, prefix: str) -> list[str]:
    out, token = [], None
    while True:
        r = client.list_objects_v2(Bucket=bucket, Prefix=prefix, **({"ContinuationToken": token} if token else {}))
        out += [o["Key"] for o in r.get("Contents", [])]
        token = r.get("NextContinuationToken")
        if not r.get("IsTruncated"):
            return out


def run(client, bucket: str, base_prefix: str, database_url: str, now: datetime.datetime | None = None, dump_fn=dump) -> dict:
    """Une sauvegarde complète : envoi, vérification, rotation. `client` : client S3 (boto3) ou équivalent."""
    now = now or datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    prefix = f"{base_prefix.strip('/')}/{PREFIX}" if base_prefix.strip("/") else PREFIX
    key = prefix + backup_name(now)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "db.dump"
        dump_fn(database_url, path)
        size, digest = path.stat().st_size, sha256(path)
        client.upload_file(str(path), bucket, key, ExtraArgs={"Metadata": {"sha256": digest}})
    head = client.head_object(Bucket=bucket, Key=key)
    if head["ContentLength"] != size:
        raise RuntimeError(f"taille différente côté stockage ({head['ContentLength']} au lieu de {size}) : sauvegarde non fiable")
    keys = list_keys(client, bucket, prefix)
    drop = [k for k in keys if parse_date(k) and k not in to_keep(keys)]
    for i in range(0, len(drop), 1000):
        client.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in drop[i:i + 1000]]})
    return {"key": key, "bytes": size, "sha256": digest, "kept": len(keys) - len(drop), "deleted": len(drop)}


def _client_and_cfg():
    import asyncio

    from app.core import storage, storage_config

    cfg = asyncio.run(storage_config.effective())
    if cfg.driver != "s3":
        raise SystemExit("Stockage objet (R2) non configuré : la sauvegarde n'est jamais écrite sur le disque du serveur. Configurez-le dans l'admin (Stockage) ou par les variables S3_*.")
    return storage._s3_client(cfg), cfg


def main(argv: list[str]) -> int:
    from app.core.config import get_settings

    client, cfg = _client_and_cfg()
    prefix = f"{cfg.prefix.strip('/')}/{PREFIX}" if cfg.prefix.strip("/") else PREFIX
    if argv[:1] == ["--list"]:
        for k in sorted(list_keys(client, cfg.bucket, prefix)):
            print(k)
        return 0
    if argv[:1] == ["--download"]:
        keys = sorted(k for k in list_keys(client, cfg.bucket, prefix) if parse_date(k))
        if not keys:
            print("Aucune sauvegarde.", file=sys.stderr)
            return 1
        key = keys[-1] if len(argv) < 2 or argv[1] == "LATEST" else argv[1]
        dest = Path(argv[2] if len(argv) > 2 else ".") / Path(key).name
        client.download_file(cfg.bucket, key, str(dest))
        print(f"{key} → {dest} ({dest.stat().st_size} octets)")
        return 0
    if not shutil.which("pg_dump"):
        print("pg_dump introuvable : installez postgresql-client.", file=sys.stderr)
        return 2
    try:
        r = run(client, cfg.bucket, cfg.prefix, os.environ.get("DATABASE_URL") or get_settings().database_url)
    except subprocess.CalledProcessError as e:
        print(f"ÉCHEC de la sauvegarde ({e.cmd[0]}) : {e.stderr.strip()[:500]}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 — tout échec doit remonter en code de sortie non nul
        print(f"ÉCHEC de la sauvegarde : {e}", file=sys.stderr)
        return 1
    print(f"Sauvegarde {r['key']} : {r['bytes']} octets, sha256 {r['sha256'][:12]}…, {r['kept']} conservée(s), {r['deleted']} supprimée(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
