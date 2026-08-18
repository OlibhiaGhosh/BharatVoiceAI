from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    elevenlabs_api_key: str = ""
    elevenlabs_stt_url: str = "https://api.elevenlabs.io/v1/speech-to-text"
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/auto"
    openrouter_url: str = "https://openrouter.ai/api/v1/chat/completions"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_bucket: str = "knowledge-base"
    supabase_table: str = "knowledge_chunks"
    confidence_threshold: float = 0.55

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
