"""
Enhanced embedder with rich metadata generation
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Iterable

from ollama import Client as OllamaClient
from supabase import Client as SupabaseClient
from supabase import create_client
from tqdm import tqdm

from src.ingest.graph_builder_enhanced import extract_entities_with_metadata
from src.settings import load_settings


logger = logging.getLogger(__name__)


def _batched(items: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _embed_text(client: OllamaClient, model: str, text: str) -> list[float]:
    response = client.embed(model=model, input=text)
    if "embeddings" in response and response["embeddings"]:
        return response["embeddings"][0]
    if "embedding" in response and response["embedding"]:
        return response["embedding"]
    raise ValueError("Unexpected embedding response format from Ollama")


def _get_clients() -> tuple[OllamaClient, SupabaseClient, str, str, str]:
    settings = load_settings()
    ollama_client = OllamaClient(host=settings.ollama_base_url)
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )
    return (
        ollama_client,
        supabase_client,
        settings.embed_model,
        settings.llm_model,
        settings.ollama_base_url,
    )


def ingest_chunks_to_supabase_enhanced(
    chunks: list[dict[str, Any]],
    batch_size: int = 20,
    use_rich_metadata: bool = True,
) -> dict[str, int]:
    """
    Enhanced ingestion with rich metadata schema

    Args:
        chunks: List of chunk dicts from chunker
        batch_size: Batch size for Supabase upserts
        use_rich_metadata: Use enhanced metadata schema (recommended)

    Returns:
        Dict with processing statistics
    """
    if not chunks:
        return {"chunks_processed": 0, "upserts": 0}

    ollama_client, supabase_client, embed_model, llm_model, ollama_base_url = _get_clients()

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for chunk in chunks:
        grouped[chunk["act_name"]].append(chunk)

    rows_to_upsert: list[dict[str, Any]] = []
    processed = 0
    extraction_failures = 0

    for act_name, act_chunks in grouped.items():
        logger.info(f"Processing {len(act_chunks)} chunks from {act_name}")

        for chunk in tqdm(act_chunks, desc=f"Embedding + metadata: {act_name}"):
            try:
                # Generate embedding
                embedding = _embed_text(ollama_client, embed_model, chunk["chunk_text"])

                # Extract entities and build rich metadata
                if use_rich_metadata:
                    try:
                        metadata = extract_entities_with_metadata(
                            chunk=chunk,
                            llm_model=llm_model,
                            ollama_base_url=ollama_base_url,
                        )
                    except Exception as exc:
                        logger.warning(
                            f"Graph extraction failed for {chunk.get('act_name')} "
                            f"section {chunk.get('section_num')}: {exc}"
                        )
                        extraction_failures += 1
                        # Create minimal metadata on failure
                        metadata = {
                            "extraction": {
                                "model": llm_model,
                                "error": str(exc),
                            },
                            "classification": {
                                "category": "general",
                                "severity": "medium",
                                "keywords": [],
                            },
                            "entities": [],
                            "relationships": [],
                        }
                else:
                    # Backward compatible simple metadata
                    metadata = dict(chunk.get("metadata", {}))

                # Extract entity and relationship arrays for direct columns
                entity_names = [e.get("name") for e in metadata.get("entities", []) if e.get("name")]
                entity_types = list(set([e.get("label") for e in metadata.get("entities", []) if e.get("label")]))
                relationship_types = list(
                    set([r.get("type") for r in metadata.get("relationships", []) if r.get("type")])
                )

                rows_to_upsert.append(
                    {
                        "act_name": chunk["act_name"],
                        "section_num": chunk["section_num"],
                        "section_title": chunk["section_title"],
                        "chunk_text": chunk["chunk_text"],
                        "chunk_index": chunk["chunk_index"],
                        "embedding": embedding,
                        "metadata": metadata,
                        # New direct columns for entities and relationships
                        "entity_names": entity_names if entity_names else None,
                        "entity_types": entity_types if entity_types else None,
                        "relationship_types": relationship_types if relationship_types else None,
                        "entities_full": metadata.get("entities", []),
                        "relationships_full": metadata.get("relationships", []),
                    }
                )
                processed += 1

            except Exception as exc:
                logger.error(f"Failed to process chunk: {exc}")
                continue

    # Batch upsert to Supabase
    upserts = 0
    for batch in _batched(rows_to_upsert, batch_size):
        try:
            supabase_client.table("legal_chunks").upsert(
                batch,
                on_conflict="act_name,section_num",
            ).execute()
            upserts += len(batch)
        except Exception as exc:
            logger.error(f"Batch upsert failed: {exc}")

    logger.info(
        f"Ingestion complete: {processed} chunks processed, {upserts} upserted, "
        f"{extraction_failures} extraction failures"
    )

    return {
        "chunks_processed": processed,
        "upserts": upserts,
        "extraction_failures": extraction_failures,
    }


# Backward compatible alias
ingest_chunks_to_supabase = ingest_chunks_to_supabase_enhanced
