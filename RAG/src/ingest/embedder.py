from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Iterable

from ollama import Client as OllamaClient
from supabase import Client as SupabaseClient
from supabase import create_client
from tqdm import tqdm

from src.ingest.graph_builder import extract_entities
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


def ingest_chunks_to_supabase(chunks: list[dict[str, Any]], batch_size: int = 20) -> dict[str, int]:
    if not chunks:
        return {"chunks_processed": 0, "upserts": 0}

    ollama_client, supabase_client, embed_model, llm_model, ollama_base_url = _get_clients()

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for chunk in chunks:
        grouped[chunk["act_name"]].append(chunk)

    rows_to_upsert: list[dict[str, Any]] = []
    processed = 0

    for act_name, act_chunks in grouped.items():
        for chunk in tqdm(act_chunks, desc=f"Embedding + metadata: {act_name}"):
            metadata = dict(chunk.get("metadata", {}))

            try:
                graph = extract_entities(
                    chunk=chunk,
                    llm_model=llm_model,
                    ollama_base_url=ollama_base_url,
                )
                metadata["entities"] = graph.get("entities", [])
                metadata["relationships"] = graph.get("relationships", [])
            except Exception as exc:
                logger.warning(
                    "Graph extraction failed for %s section %s: %s",
                    chunk.get("act_name"),
                    chunk.get("section_num"),
                    exc,
                )
                metadata["entities"] = []
                metadata["relationships"] = []
                metadata["graph_extraction_error"] = str(exc)

            embedding = _embed_text(ollama_client, embed_model, chunk["chunk_text"])
            rows_to_upsert.append(
                {
                    "act_name": chunk["act_name"],
                    "section_num": chunk["section_num"],
                    "section_title": chunk["section_title"],
                    "chunk_text": chunk["chunk_text"],
                    "chunk_index": chunk["chunk_index"],
                    "embedding": embedding,
                    "metadata": metadata,
                }
            )
            processed += 1

    upserts = 0
    for batch in _batched(rows_to_upsert, batch_size):
        supabase_client.table("legal_chunks").upsert(
            batch,
            on_conflict="act_name,section_num",
        ).execute()
        upserts += len(batch)

    return {"chunks_processed": processed, "upserts": upserts}
