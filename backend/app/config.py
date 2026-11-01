"""Central, environment-driven configuration. No secrets are hardcoded anywhere else."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"

    # Storage
    database_url: str = "sqlite+aiosqlite:///./dds.db"
    redis_url: str | None = None

    # HTTP
    cors_origins: str = "http://localhost:3000"
    rate_limit_per_minute: int = 120

    # LLM provider abstraction (gemini | openai | none)
    llm_provider: str = "none"
    llm_model: str = ""
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_temperature: float = 0.1
    llm_max_tokens: int = 2048
    llm_max_retries: int = 2
    llm_timeout_s: float = 60.0

    # Embeddings (hash = deterministic lexical-hash baseline, NOT semantic)
    embedding_provider: str = "hash"
    embedding_model: str = ""
    embedding_dim: int = 384

    # Retrieval / chunking (all configurable)
    chunk_size: int = 900
    chunk_overlap: int = 150
    retrieval_top_k: int = 8
    max_context_chars: int = 12000
    rrf_k: int = 60

    # Fetching
    fetch_timeout_s: float = 15.0
    fetch_max_bytes: int = 5_000_000
    fetch_max_redirects: int = 3
    fetch_retries: int = 1
    respect_robots: bool = True
    allow_private_urls: bool = False  # keep False outside local tests
    user_agent: str = "DigitalDarkSpotBot/1.0 (+research; respects robots.txt)"
    firecrawl_api_key: str = ""
    playwright_enabled: bool = False

    # Uploads
    upload_max_bytes: int = 10 * 1024 * 1024
    upload_max_pages: int = 300
    pdf_backend: str = "auto"  # auto | pypdf | docling

    # Freshness
    freshness_max_age_days: int = 548

    # Completeness score weights (must sum to 1.0)
    score_w_coverage: float = 0.40
    score_w_evidence: float = 0.25
    score_w_reliability: float = 0.20
    score_w_freshness: float = 0.15

    # Observability (optional; never blocks the app)
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = ""
    otel_exporter_otlp_endpoint: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def score_weights(self) -> dict[str, float]:
        return {
            "coverage": self.score_w_coverage,
            "evidence": self.score_w_evidence,
            "reliability": self.score_w_reliability,
            "freshness": self.score_w_freshness,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
