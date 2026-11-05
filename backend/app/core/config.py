"""Configuration par variables d'environnement (pydantic-settings). Un secret de dev est refusé en production."""
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    node_env: str = Field("development", alias="NODE_ENV")  # nom conservé : partagé avec le front
    port: int = Field(4000, alias="PORT")
    database_url: str = Field(..., alias="DATABASE_URL")
    app_url: str = Field("http://localhost:3000", alias="APP_URL")
    api_url: str = Field("http://localhost:4000", alias="API_URL")
    cookie_domain: str | None = Field(None, alias="COOKIE_DOMAIN")
    session_ttl_days: int = Field(30, alias="SESSION_TTL_DAYS")
    require_email_verification: bool = Field(True, alias="REQUIRE_EMAIL_VERIFICATION")
    # Développement local uniquement : code de confirmation d'e-mail fixe (défaut 000000 ; DEV_EMAIL_CODE= vide pour le désactiver). Refusé en production.
    dev_email_code: str | None = Field(None, alias="DEV_EMAIL_CODE")
    google_client_id: str | None = Field(None, alias="GOOGLE_CLIENT_ID")
    smtp_url: str | None = Field(None, alias="SMTP_URL")
    mail_from: str = Field("DuoMatch <no-reply@duomatch.app>", alias="MAIL_FROM")
    upload_dir: str = Field("./uploads", alias="UPLOAD_DIR")
    payment_provider: str = Field("mock", alias="PAYMENT_PROVIDER")
    site_name: str = Field("DuoMatch", alias="SITE_NAME")
    kkiapay_public_key: str | None = Field(None, alias="KKIAPAY_PUBLIC_KEY")
    kkiapay_private_key: str | None = Field(None, alias="KKIAPAY_PRIVATE_KEY")
    kkiapay_webhook_secret: str | None = Field(None, alias="KKIAPAY_WEBHOOK_SECRET")
    kkiapay_sandbox: bool = Field(True, alias="KKIAPAY_SANDBOX")
    payment_webhook_secret: str = Field("dev-only-webhook-secret-change-me", alias="PAYMENT_WEBHOOK_SECRET")
    ip_hash_salt: str = Field("dev-only-ip-salt", alias="IP_HASH_SALT")

    @field_validator("database_url")
    @classmethod
    def _clean_url(cls, v: str) -> str:
        # Les URL héritées de Prisma portent « ?schema=public » que les pilotes Python refusent.
        parts = urlsplit(v)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))

    @model_validator(mode="after")
    def _check(self) -> "Settings":
        if self.node_env == "production" and (
            self.payment_webhook_secret.startswith("dev-only") or self.ip_hash_salt.startswith("dev-only")
        ):
            raise ValueError("Secrets de développement détectés en production : définissez PAYMENT_WEBHOOK_SECRET et IP_HASH_SALT.")
        if self.dev_email_code and not (self.dev_email_code.isdigit() and len(self.dev_email_code) == 6):
            raise ValueError("DEV_EMAIL_CODE doit contenir exactement 6 chiffres.")
        if self.node_env == "production" and self.dev_email_code:
            raise ValueError("DEV_EMAIL_CODE est interdit en production : le code de confirmation d'e-mail doit être aléatoire.")
        if self.payment_provider == "kkiapay":
            missing = [k for k, v in {
                "KKIAPAY_PUBLIC_KEY": self.kkiapay_public_key,
                "KKIAPAY_PRIVATE_KEY": self.kkiapay_private_key,
                "KKIAPAY_WEBHOOK_SECRET": self.kkiapay_webhook_secret,
            }.items() if not v]
            if missing:
                raise ValueError(f"PAYMENT_PROVIDER=kkiapay : variables manquantes : {', '.join(missing)}")
        return self

    @property
    def fixed_email_code(self) -> str | None:
        """Code fixe de confirmation d'e-mail, EN DÉVELOPPEMENT LOCAL SEULEMENT (jamais en test ni en production) : 000000 par défaut."""
        if self.node_env != "development":
            return None
        return (self.dev_email_code if self.dev_email_code is not None else "000000") or None

    @property
    def is_prod(self) -> bool:
        return self.node_env == "production"

    @property
    def async_url(self) -> str:
        return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    @property
    def sync_url(self) -> str:
        return self.database_url.replace("postgresql://", "postgresql+psycopg2://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings
