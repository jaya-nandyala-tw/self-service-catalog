"""
Application configuration using pydantic-settings.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    
    # Application
    app_name: str = "Catalog Service"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "catalog_user"
    postgres_password: str = "catalog_password"
    postgres_db: str = "catalog_db"
    
    # Apps directory (source of truth for manifests)
    apps_dir: str = "../apps"
    
    @property
    def database_url(self) -> str:
        """Construct the async PostgreSQL database URL."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
    
    @property
    def apps_directory_path(self) -> Path:
        """Get the absolute path to the apps directory."""
        return Path(__file__).parent.parent.resolve() / self.apps_dir


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()

