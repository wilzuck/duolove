"""Détection d'arnaque dans la messagerie : règles simples et lisibles (pas d'IA), appliquées au message AFFICHÉ au destinataire.

Rien n'est bloqué ni supprimé : le destinataire voit un avertissement discret (« ne jamais envoyer d'argent à quelqu'un que vous n'avez pas rencontré »)
avec un bouton pour signaler. Les règles visent les schémas d'arnaque les plus courants : demande d'argent ou de recharge, frais prétendus (douane, colis, visa),
cryptomonnaies et cartes cadeaux, urgence dramatique, passage immédiat vers une autre messagerie, liens externes.

Niveaux : « high » (demande d'argent ou combinaison inquiétante), « caution » (autre messagerie, numéro, lien), « none ».
Le faux positif est assumé comme préférable à l'arnaque non signalée, mais un message anodin (« j'adore la musique ») ne doit jamais être marqué : voir les tests."""
from __future__ import annotations

import re
import unicodedata


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


# Les motifs sont écrits SANS accents (le texte est replié avant comparaison).
MONEY = [
    r"\b(envoie|envoyer|envoyez|envoi|transfere|transferer|transferez|vire|virer|virez)\b.{0,25}\b(argent|sous|fcfa|cfa|xof|euros?|dollars?|\d{3,})",
    r"\b(besoin|manque|manquer)\b.{0,15}\b(argent|sous|fcfa|cfa|d aide financiere|de fonds)",
    r"\b(preter|prete|pretez|pret)\b.{0,12}\b(argent|moi|de l argent|\d{3,})",
    r"\b(recharge|recharger|rechargez|credit)\b.{0,20}\b(orange|mtn|moov|telephone|forfait|unites?|code)",
    r"\b(orange money|mtn money|moov money|momo|mobile money|wave|flooz|t money|tmoney)\b.{0,40}\b(envoi|envoy|transf|depot|numero|compte)",
    r"\b(western union|moneygram|ria money|remitly|paypal|bitcoin|btc|usdt|ethereum|crypto)\b",
    r"\bcarte(s)? (cadeau|itunes|google play|amazon|steam|apple)\b",
    r"\b(frais|taxe|taxes)\b.{0,20}\b(douane|transport|envoi|expedition|visa|dedouanement|colis|avocat|deblocage)",
    r"\b(iban|rib|numero de compte|compte bancaire)\b",
    r"\b(investir|investissement|placement)\b.{0,30}\b(garanti|rapide|rentable|gains?|profit)",
]
URGENCY = [
    r"\b(urgent|urgence|d urgence|immediatement|tres vite)\b",
    r"\b(hopital|accident|malade|operation|decede|deces|bloque(e)? (a|en) la douane|bloque(e)? a l aeroport|colis|heritage|herite|gagne(e)? (un|une|a la)|loterie)\b",
]
OFF_PLATFORM = [r"\b(whatsapp|whats app|telegram|signal|snap(chat)?|viber|imo|wechat|messenger)\b", r"(?<!\d)(\+|00)\s?\d[\d .\-]{7,}\d"]
LINK = [r"https?://", r"\bwww\.", r"\b(bit\.ly|tinyurl|t\.me|wa\.me|cutt\.ly)\b"]

_MONEY, _URGENCY, _OFF, _LINK = ([re.compile(p) for p in g] for g in (MONEY, URGENCY, OFF_PLATFORM, LINK))


def _hit(rx: list[re.Pattern], text: str) -> bool:
    return any(r.search(text) for r in rx)


def analyze(body: str | None) -> dict:
    """{'level': 'none'|'caution'|'high', 'flags': [...]} pour un texte de message."""
    if not body or len(body) < 6:
        return {"level": "none", "flags": []}
    t = _fold(body)
    flags = []
    if _hit(_MONEY, t):
        flags.append("MONEY")
    if _hit(_URGENCY, t):
        flags.append("URGENCY")
    if _hit(_OFF, t):
        flags.append("OFF_PLATFORM")
    if _hit(_LINK, t):
        flags.append("LINK")
    # « urgent » ou « colis » seuls ne suffisent pas : il faut une demande d'argent, ou l'urgence avec une sortie de la plateforme / un lien.
    high = "MONEY" in flags or ("URGENCY" in flags and ({"OFF_PLATFORM", "LINK"} & set(flags)))
    caution = bool({"OFF_PLATFORM", "LINK"} & set(flags))
    level = "high" if high else "caution" if caution else "none"
    return {"level": level, "flags": [f for f in flags if level != "none" and (f != "URGENCY" or high)]}
