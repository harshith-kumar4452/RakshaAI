"""
Entity and relationship query helpers
Direct column access for fast entity/relationship queries
"""
from __future__ import annotations

import logging
from typing import Any

from supabase import Client as SupabaseClient
from supabase import create_client

from src.settings import load_settings


logger = logging.getLogger(__name__)


def get_supabase_client() -> SupabaseClient:
    """Get Supabase client"""
    settings = load_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


def find_by_entity_name(entity_name: str, k: int = 10) -> list[dict[str, Any]]:
    """
    Find chunks containing a specific entity name

    Args:
        entity_name: Entity name to search for (case-insensitive partial match)
        k: Number of results to return

    Returns:
        List of chunks containing the entity
    """
    try:
        supabase = get_supabase_client()
        response = supabase.rpc(
            "find_by_entity_name",
            {"entity_name_pattern": entity_name, "match_count": k},
        ).execute()

        return response.data if response.data else []

    except Exception as e:
        logger.error(f"find_by_entity_name failed: {e}")
        return []


def find_by_entity_type(
    entity_type: str,  # 'Offence', 'Punishment', 'Authority', 'Victim', 'Platform'
    k: int = 10,
) -> list[dict[str, Any]]:
    """
    Find chunks containing entities of a specific type

    Args:
        entity_type: Entity type ('Offence', 'Punishment', 'Authority', 'Victim', 'Platform')
        k: Number of results to return

    Returns:
        List of chunks with entities of that type
    """
    try:
        supabase = get_supabase_client()
        response = supabase.rpc(
            "find_by_entity_type",
            {"entity_type": entity_type, "match_count": k},
        ).execute()

        return response.data if response.data else []

    except Exception as e:
        logger.error(f"find_by_entity_type failed: {e}")
        return []


def find_by_relationship_type(
    relationship_type: str,  # 'DEFINES', 'PRESCRIBES', 'HANDLED_BY', etc.
    k: int = 10,
) -> list[dict[str, Any]]:
    """
    Find chunks containing relationships of a specific type

    Args:
        relationship_type: Relationship type ('DEFINES', 'PRESCRIBES', 'HANDLED_BY', etc.)
        k: Number of results to return

    Returns:
        List of chunks with relationships of that type
    """
    try:
        supabase = get_supabase_client()
        response = supabase.rpc(
            "find_by_relationship_type",
            {"rel_type": relationship_type, "match_count": k},
        ).execute()

        return response.data if response.data else []

    except Exception as e:
        logger.error(f"find_by_relationship_type failed: {e}")
        return []


def find_entity_connections(
    entity1: str,
    entity2: str,
    k: int = 10,
) -> list[dict[str, Any]]:
    """
    Find chunks that mention both entities (potential relationships)

    Args:
        entity1: First entity name pattern
        entity2: Second entity name pattern
        k: Number of results to return

    Returns:
        List of chunks mentioning both entities
    """
    try:
        supabase = get_supabase_client()
        response = supabase.rpc(
            "find_entity_connections",
            {
                "entity1_pattern": entity1,
                "entity2_pattern": entity2,
                "match_count": k,
            },
        ).execute()

        return response.data if response.data else []

    except Exception as e:
        logger.error(f"find_entity_connections failed: {e}")
        return []


def get_all_entities() -> list[dict[str, Any]]:
    """
    Get all unique entities across the database with statistics

    Returns:
        List of entities with occurrence counts and sample sections
        Format: [
            {
                "entity_name": "Sexual Harassment",
                "entity_type": "Offence",
                "occurrence_count": 15,
                "sample_sections": ["BNS 2023 § 354A", "POSH Act § 2"]
            }
        ]
    """
    try:
        supabase = get_supabase_client()
        response = supabase.rpc("get_all_entities").execute()

        return response.data if response.data else []

    except Exception as e:
        logger.error(f"get_all_entities failed: {e}")
        return []


def get_relationship_stats() -> list[dict[str, Any]]:
    """
    Get relationship statistics across the database

    Returns:
        List of relationship types with counts and sample pairs
        Format: [
            {
                "relationship_type": "DEFINES",
                "count": 120,
                "sample_pairs": [
                    {"from": "section_354a", "to": "sexual_harassment", "section": "354A"}
                ]
            }
        ]
    """
    try:
        supabase = get_supabase_client()
        response = supabase.rpc("get_relationship_stats").execute()

        return response.data if response.data else []

    except Exception as e:
        logger.error(f"get_relationship_stats failed: {e}")
        return []


def hybrid_search_with_entity_filter(
    query: str,
    k: int = 10,
    entity_type: str | None = None,
    entity_name: str | None = None,
    relationship_type: str | None = None,
    vector_weight: float = 0.5,
) -> list[dict[str, Any]]:
    """
    Hybrid search with entity and relationship filtering

    Args:
        query: Search query text
        k: Number of results
        entity_type: Filter by entity type ('Offence', 'Punishment', etc.)
        entity_name: Filter by entity name
        relationship_type: Filter by relationship type ('DEFINES', 'PRESCRIBES', etc.)
        vector_weight: 0.0 = pure BM25, 1.0 = pure vector

    Returns:
        List of matching chunks with entity/relationship info
    """
    from ollama import Client as OllamaClient

    settings = load_settings()
    supabase = get_supabase_client()
    ollama_client = OllamaClient(host=settings.ollama_base_url)

    # Generate query embedding
    response = ollama_client.embed(model=settings.embed_model, input=query)
    query_embedding = response.get("embedding") or response.get("embeddings", [[]])[0]

    try:
        response = supabase.rpc(
            "hybrid_search_with_entities",
            {
                "query_text": query,
                "query_embedding": query_embedding,
                "match_count": k,
                "filter_entity_type": entity_type,
                "filter_entity_name": entity_name,
                "filter_rel_type": relationship_type,
                "vector_weight": vector_weight,
            },
        ).execute()

        results = []
        for row in response.data:
            results.append(
                {
                    "id": row["id"],
                    "act_name": row["act_name"],
                    "section_num": row["section_num"],
                    "section_title": row["section_title"],
                    "chunk_text": row["chunk_text"],
                    "hybrid_score": row["hybrid_score"],
                    "entity_names": row.get("entity_names", []),
                    "entity_types": row.get("entity_types", []),
                    "relationship_types": row.get("relationship_types", []),
                }
            )

        logger.info(f"Hybrid search with filters returned {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"hybrid_search_with_entity_filter failed: {e}")
        return []


def get_entity_graph_data(entity_type_filter: str | None = None) -> dict[str, Any]:
    """
    Get all entities and relationships for graph visualization

    Args:
        entity_type_filter: Optional filter by entity type

    Returns:
        Dict with nodes and edges for graph visualization
    """
    try:
        supabase = get_supabase_client()

        # Build query
        query = supabase.table("legal_chunks").select(
            "act_name,section_num,section_title,entity_names,entity_types,entities_full,relationships_full"
        )

        # Apply filter if specified
        if entity_type_filter:
            query = query.contains("entity_types", [entity_type_filter])

        response = query.execute()

        nodes = []
        edges = []
        node_ids = set()

        for row in response.data:
            # Add section node
            section_id = f"{row['act_name']}:{row['section_num']}"
            if section_id not in node_ids:
                nodes.append(
                    {
                        "id": section_id,
                        "label": f"{row['section_num']}",
                        "title": f"{row['act_name']} - {row['section_title']}",
                        "group": row["act_name"],
                        "type": "Section",
                    }
                )
                node_ids.add(section_id)

            # Add entity nodes
            for entity in row.get("entities_full", []):
                entity_id = entity.get("id")
                if entity_id and entity_id not in node_ids:
                    nodes.append(
                        {
                            "id": entity_id,
                            "label": entity.get("name", entity_id),
                            "title": f"{entity.get('label', 'Entity')}: {entity.get('name', entity_id)}",
                            "group": entity.get("label", "Entity"),
                            "type": entity.get("label", "Entity"),
                            "confidence": entity.get("confidence", 0.8),
                        }
                    )
                    node_ids.add(entity_id)

                    # Connect entity to section
                    edges.append({"from": section_id, "to": entity_id, "label": "CONTAINS", "arrows": "to"})

            # Add relationship edges
            for rel in row.get("relationships_full", []):
                from_id = rel.get("from_id")
                to_id = rel.get("to_id")
                rel_type = rel.get("type", "RELATED_TO")

                if from_id and to_id and from_id in node_ids and to_id in node_ids:
                    edges.append(
                        {
                            "from": from_id,
                            "to": to_id,
                            "label": rel_type,
                            "arrows": "to",
                            "confidence": rel.get("confidence", 0.8),
                        }
                    )

        return {
            "nodes": nodes,
            "edges": edges,
            "total_chunks": len(response.data),
            "filter": entity_type_filter,
        }

    except Exception as e:
        logger.error(f"get_entity_graph_data failed: {e}")
        return {"nodes": [], "edges": [], "total_chunks": 0}
