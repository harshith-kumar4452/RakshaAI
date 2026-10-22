from __future__ import annotations

from typing import Any

from neo4j import GraphDatabase
from ollama import Client as OllamaClient
from supabase import Client as SupabaseClient
from supabase import create_client

from src.settings import load_settings


CATEGORY_KEYWORDS = {
    "sexual_harassment": ["sexual harassment", "modesty", "voyeurism", "unwelcome"],
    "cyberbullying": ["stalking", "cyberstalking", "online", "obscene", "electronic"],
    "bullying": ["intimidation", "defamation", "criminal force", "assault"],
    "verbal_abuse": ["insult", "intimidation", "defamation", "threat"],
    "minor_involved": ["child", "minor", "POCSO", "grooming", "pornography"],
}


def _get_clients() -> tuple[OllamaClient, SupabaseClient]:
    settings = load_settings()
    ollama_client = OllamaClient(host=settings.ollama_base_url)
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )
    return ollama_client, supabase_client


def vector_search(query: str, k: int = 5, act_filter: str | None = None) -> list[dict[str, Any]]:
    settings = load_settings()
    ollama_client, supabase_client = _get_clients()

    embedding_response = ollama_client.embed(model=settings.embed_model, input=query)
    query_embedding = embedding_response.get("embeddings", [[None]])[0]

    if not query_embedding:
        return []

    try:
        rpc_response = (
            supabase_client.rpc(
                "match_legal_sections",
                {
                    "query_embedding": query_embedding,
                    "match_count": k,
                    "filter_act": act_filter,
                },
            )
            .execute()
            .data
        )
    except Exception:
        return []

    results: list[dict[str, Any]] = []
    for row in rpc_response or []:
        results.append(
            {
                "act_name": row.get("act_name"),
                "section_num": row.get("section_num"),
                "section_title": row.get("section_title"),
                "chunk_text": row.get("chunk_text"),
                "similarity": row.get("similarity"),
            }
        )

    return results


def graph_search(offence_keywords: list[str]) -> list[dict[str, Any]]:
    settings = load_settings()
    if not (settings.neo4j_uri and settings.neo4j_user and settings.neo4j_password):
        return []

    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )

    cypher = """
    MATCH (o:Offence)-[r]-(s:Section)<-[:CONTAINS]-(a:Act)
    WHERE any(kw IN $keywords WHERE toLower(o.name) CONTAINS toLower(kw))
    RETURN a.name as act, s.section_num as section,
           o.name as offence, type(r) as rel
    LIMIT 10
    """

    try:
        with driver.session() as session:
            rows = session.run(cypher, keywords=offence_keywords)
            return [dict(row) for row in rows]
    except Exception:
        return []
    finally:
        driver.close()


def hybrid_retrieve(complaint_text: str, category: str) -> dict[str, Any]:
    keywords = CATEGORY_KEYWORDS.get(category, [])
    vector_chunks = vector_search(complaint_text, k=5)
    graph_paths = graph_search(keywords) if keywords else []

    return {
        "vector_chunks": vector_chunks,
        "graph_paths": graph_paths,
    }
