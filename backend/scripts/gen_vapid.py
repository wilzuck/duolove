"""Génère une paire de clés VAPID pour les notifications push. À lancer UNE FOIS, sur votre machine :

    cd backend && .venv/bin/python scripts/gen_vapid.py

Copiez ensuite les deux lignes affichées dans les variables d'environnement du service API (Railway). La clé PRIVÉE est un secret : ne la collez nulle part d'autre,
ne la commitez jamais. Changer la paire plus tard oblige chaque appareil à se réabonner.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


key = ec.generate_private_key(ec.SECP256R1())
private = b64(key.private_numbers().private_value.to_bytes(32, "big"))
public = b64(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
print(f"VAPID_PUBLIC_KEY={public}")
print(f"VAPID_PRIVATE_KEY={private}")
print("VAPID_SUBJECT=mailto:contact@crushduo.com   # une adresse e-mail que vous lisez")
