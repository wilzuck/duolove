"""Sauvegarde nocturne de la base PostgreSQL vers R2 (cron Railway, docker/railway.backup.json). Le noyau est dans app/core/backups.py.

Usage :  python -m scripts.backup_db                         sauvegarde, vérification, rotation (code de sortie non nul en cas d'échec)
         python -m scripts.backup_db --list                   liste les sauvegardes
         python -m scripts.backup_db --download LATEST|<clé> [dossier]   télécharge une sauvegarde pour la restaurer (docs/BACKUP.md)"""
from __future__ import annotations

import asyncio
import os
import shutil
import sys
from pathlib import Path

from app.core.backups import *  # noqa: F401,F403 — noms réexportés pour les tests et l'usage en ligne de commande
from app.core.backups import PREFIX, client_and_cfg, list_backups, parse_date, prefix_for, run_and_record  # noqa: F401


def main(argv: list[str]) -> int:
    from app.core.config import get_settings

    try:
        client, cfg = asyncio.run(client_and_cfg())
    except RuntimeError:
        print("Stockage objet (R2) non configuré : la sauvegarde n'est jamais écrite sur le disque du serveur. Configurez-le dans l'admin (Stockage) ou par les variables S3_*.", file=sys.stderr)
        return 1
    if argv[:1] == ["--list"]:
        for b in list_backups(client, cfg.bucket, cfg.prefix):
            print(f"{b['key']}  {b['bytes']} octets")
        return 0
    if argv[:1] == ["--download"]:
        items = list_backups(client, cfg.bucket, cfg.prefix)
        if not items:
            print("Aucune sauvegarde.", file=sys.stderr)
            return 1
        key = items[0]["key"] if len(argv) < 2 or argv[1] == "LATEST" else argv[1]
        dest = Path(argv[2] if len(argv) > 2 else ".") / Path(key).name
        client.download_file(cfg.bucket, key, str(dest))
        print(f"{key} → {dest} ({dest.stat().st_size} octets)")
        return 0
    if not shutil.which("pg_dump"):
        print("pg_dump introuvable : installez postgresql-client (version du serveur ou plus récente).", file=sys.stderr)
        return 2
    last = asyncio.run(run_and_record("nightly", os.environ.get("DATABASE_URL") or get_settings().database_url))
    if not last["ok"]:
        print(f"ÉCHEC de la sauvegarde : {last['error']}", file=sys.stderr)
        return 1
    print(f"Sauvegarde {last['key']} : {last['bytes']} octets.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
