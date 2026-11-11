"""Configuration par variables d'environnement (pydantic-settings). Un secret de dev est refusé en production."""
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # str_strip_whitespace : une tabulation / un espace collé dans une variable Railway (ex. COOKIE_DOMAIN="\t.exemple.com") ne casse plus le serveur.
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore", str_strip_whitespace=True)

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
    # E-mail par l'API HTTP de Brevo (prioritaire sur SMTP_URL) : fonctionne sur tous les forfaits Railway, sans port SMTP.
    brevo_api_key: str | None = Field(None, alias="BREVO_API_KEY")
    mail_from: str = Field("Crushduo <no-reply@crushduo.com>", alias="MAIL_FROM")
    # Retours d'Amazon SES (rebonds, plaintes) reçus via Amazon SNS : seul ce sujet SNS est accepté. Sans lui, le point d'entrée /webhooks/ses refuse tout.
    # Pool de connexions à la base : ajuster selon `max_connections` de PostgreSQL (somme de tous les processus < max_connections).
    db_pool_size: int = Field(10, alias="DB_POOL_SIZE", ge=1, le=200)
    db_max_overflow: int = Field(10, alias="DB_MAX_OVERFLOW", ge=0, le=200)
    ses_sns_topic_arn: str | None = Field(None, alias="SES_SNS_TOPIC_ARN")
    upload_dir: str = Field("./uploads", alias="UPLOAD_DIR")
    # Stockage des fichiers : « local » (dossier UPLOAD_DIR, volume) ou « s3 » (stockage objet compatible S3 : Railway Buckets, Cloudflare R2, AWS).
    storage_driver: str = Field("local", alias="STORAGE_DRIVER")
    s3_endpoint: str | None = Field(None, alias="S3_ENDPOINT")
    s3_bucket: str | None = Field(None, alias="S3_BUCKET")
    s3_access_key_id: str | None = Field(None, alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: str | None = Field(None, alias="S3_SECRET_ACCESS_KEY")
    s3_region: str = Field("auto", alias="S3_REGION")
    s3_prefix: str = Field("", alias="S3_PREFIX")
    # Chiffre les secrets saisis dans la console d'administration (ex. clé secrète R2). Sans elle, la console refuse d'enregistrer un secret.
    settings_encryption_key: str | None = Field(None, alias="SETTINGS_ENCRYPTION_KEY")
    payment_provider: str = Field("mock", alias="PAYMENT_PROVIDER")
    # Appels audio/vidéo : « mock » (simulé, sans média) ou « livekit » (LiveKit Cloud ou auto-hébergé). Les clés ne servent qu'à signer des jetons d'accès.
    call_provider: str = Field("mock", alias="CALL_PROVIDER")
    livekit_url: str | None = Field(None, alias="LIVEKIT_URL")
    livekit_api_key: str | None = Field(None, alias="LIVEKIT_API_KEY")
    livekit_api_secret: str | None = Field(None, alias="LIVEKIT_API_SECRET")
    site_name: str = Field("Crushduo", alias="SITE_NAME")
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
        if self.call_provider not in ("mock", "livekit"):
            raise ValueError("CALL_PROVIDER doit valoir « mock » ou « livekit ».")
        if self.call_provider == "livekit":
            missing = [k for k, v in {"LIVEKIT_URL": self.livekit_url, "LIVEKIT_API_KEY": self.livekit_api_key, "LIVEKIT_API_SECRET": self.livekit_api_secret}.items() if not v]
            if missing:
                raise ValueError(f"CALL_PROVIDER=livekit : variables manquantes : {', '.join(missing)}")
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
    def calls_available(self) -> bool:
        """Les appels existent si un vrai fournisseur est configuré ; en production le mode simulé n'est JAMAIS proposé (il ne transmet ni son ni image)."""
        return self.call_provider == "livekit" or self.node_env != "production"

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
