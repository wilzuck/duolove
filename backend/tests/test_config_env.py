"""Les réglages lus dans l'environnement sont nettoyés : une tabulation ou un espace collé par erreur ne casse plus le serveur."""
from app.core.config import Settings


def test_whitespace_around_env_values_is_stripped(monkeypatch):
    # Incident du 8 nov. 2026 : COOKIE_DOMAIN="\t.crushduo.com" (collé depuis un tableau) faisait échouer TOUTES les connexions (CookieError).
    monkeypatch.setenv("COOKIE_DOMAIN", "\t.crushduo.com")
    monkeypatch.setenv("APP_URL", " https://crushduo.com \n")
    monkeypatch.setenv("API_URL", "https://api.crushduo.com\t")
    s = Settings()
    assert s.cookie_domain == ".crushduo.com"
    assert s.app_url == "https://crushduo.com"
    assert s.api_url == "https://api.crushduo.com"
