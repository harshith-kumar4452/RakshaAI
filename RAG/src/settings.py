from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass
class Settings:
    supabase_url: str
    supabase_service_key: str
    neo4j_uri: str | None
    neo4j_user: str | None
    neo4j_password: str | None
    ollama_base_url: str
    embed_model: str
    llm_model: str


def _value(*keys: str, default: str | None = None) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value is not None and value.strip() != "":
            return value.strip()
    return default


def load_settings() -> Settings:
    load_dotenv()

    supabase_url = _value("SUPABASE_URL", "API_URL")
    supabase_service_key = _value("SUPABASE_SERVICE_KEY", "service_role", "SERVICE_ROLE")

    if not supabase_url or not supabase_service_key:
        raise ValueError(
            "Missing Supabase credentials. Set SUPABASE_URL/API_URL and SUPABASE_SERVICE_KEY/service_role in .env"
        )

    return Settings(
        supabase_url=supabase_url,
        supabase_service_key=supabase_service_key,
        neo4j_uri=_value("NEO4J_URI"),
        neo4j_user=_value("NEO4J_USER", "neo4j_username"),
        neo4j_password=_value("NEO4J_PASSWORD", "neo4j_password"),
        ollama_base_url=_value("OLLAMA_BASE_URL", default="http://localhost:11434") or "http://localhost:11434",
        embed_model=_value("EMBED_MODEL", default="nomic-embed-text") or "nomic-embed-text",
        llm_model=_value("LLM_MODEL", default="qwen2.5:1.5b") or "qwen2.5:1.5b",
    )
