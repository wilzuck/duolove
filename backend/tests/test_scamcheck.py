"""Détection d'arnaque : des cas réels d'arnaque marqués, des messages ordinaires jamais marqués."""
import pytest

from app.core.scamcheck import analyze

HIGH = [
    "Peux-tu m'envoyer de l'argent par Orange Money stp ? c'est urgent",
    "j'ai besoin d'argent pour payer l'hôpital de ma mère",
    "Envoie moi 50000 fcfa sur mon compte momo",
    "Je suis bloqué à la douane, il faut payer les frais de douane avant demain",
    "Achète une carte cadeau iTunes et envoie-moi le code",
    "Écris-moi sur WhatsApp, c'est urgent, mon colis est bloqué",
    "Fais un virement sur mon RIB, je te rembourse",
    "Prête-moi 20000 s'il te plaît",
    "Il y a un investissement garanti en bitcoin, très rentable",
    "Je peux t'envoyer des cadeaux mais il faut payer les frais d'envoi du colis",
]
CAUTION = [
    "On peut continuer sur WhatsApp ? c'est plus simple",
    "Mon numéro : +229 97 12 34 56",
    "Regarde mes photos ici https://exemple.com/photos",
    "Ajoute-moi sur Telegram",
]
NONE = [
    "Salut, j'adore la musique et la cuisine. Et toi ?",
    "Quel est ton plat préféré ? Moi c'est l'attiéké poisson.",
    "Je travaille à Cotonou comme infirmière, et toi ?",
    "On pourrait se voir ce week-end dans un café ?",
    "Merci pour le message, je réponds ce soir !",
    "J'ai passé une journée urgente au bureau mais maintenant je suis libre",
    "Mon colis est arrivé, un cadeau pour ma sœur",
    "J'ai vu un film hier, le crédit photo était magnifique",
    "",
    "ok",
]


@pytest.mark.parametrize("text", HIGH)
def test_arnaques_marquees_haut(text):
    r = analyze(text)
    assert r["level"] == "high" and r["flags"], text


@pytest.mark.parametrize("text", CAUTION)
def test_autre_messagerie_ou_lien_marque_prudence(text):
    assert analyze(text)["level"] == "caution", text


@pytest.mark.parametrize("text", NONE)
def test_messages_ordinaires_jamais_marques(text):
    assert analyze(text) == {"level": "none", "flags": []}, text
