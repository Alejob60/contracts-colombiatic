"""
Application configuration loaded from environment variables.

Uses pydantic-settings to validate and type-check all config at startup.
Every field has a sensible default for local development; production values
come from systemd Environment= directives or Secrets Manager injection.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed, validated application settings sourced from env vars / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # silently ignore AWS_DEFAULT_REGION and any other OS env vars
    )

    # ── Application ──────────────────────────────────────────────────────
    APP_NAME: str = "contracts-api"
    APP_ENV: str = "development"  # development | staging | production
    LOG_LEVEL: str = "INFO"

    # ── Database (PostgreSQL + asyncpg, schema=contracts) ────────────────
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432"
        "/colombiatic?options=-c%20search_path%3Dcontracts"
    )

    # ── Redis (DB 2 to avoid collision with GovDocs DB 0 / Atelier DB 1) ─
    REDIS_URL: str = "redis://127.0.0.1:6379/2"

    # ── JWT ───────────────────────────────────────────────────────────────
    JWT_SECRET: str = "CHANGE-ME-in-production"
    JWT_ALGORITHM: str = "HS256"

    # ── AWS / Bedrock ─────────────────────────────────────────────────────
    AWS_REGION: str = "us-east-1"
    BEDROCK_MODEL_EVALUATOR: str = "anthropic.claude-3-haiku-20240307-v1:0"
    BEDROCK_MODEL_EMBED: str = "amazon.titan-embed-text-v2:0"

    # ── SECOP II (Datos Abiertos Socrata endpoint) ────────────────────────
    SECOP_API_URL: str = "https://www.datos.gov.co/resource/p6dx-8zbt.json"
    SECOP_APP_TOKEN: str | None = None            # X-App-Token header (rate-limit boost)
    SECOP_SECRET_TOKEN: str | None = None          # Authenticated SODA requests
    SECOP_API_KEY_ID: str | None = None            # OAuth2 client ID
    SECOP_API_KEY_SECRET: str | None = None         # OAuth2 client secret
    # Cache TTLs in seconds
    SECOP_CACHE_TTL_SEARCH: int = 900       # 15 min for search results
    SECOP_CACHE_TTL_DETAIL: int = 21600     # 6 h for individual process detail

    # ── S3 Document Storage ──────────────────────────────────────────────
    S3_BUCKET_DOCUMENTS: str = "contracts-documents"
    S3_REGION: str = "us-east-1"

    # ── Freemium Rate Limiting ───────────────────────────────────────────
    FREEMIUM_MAX_SEARCHES: int = 3          # searches per window for free tier
    FREEMIUM_COUNTER_TTL: int = 86400       # 24 h rolling window in seconds
