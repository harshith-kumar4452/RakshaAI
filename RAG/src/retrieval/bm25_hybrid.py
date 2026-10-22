"""
Hybrid retrieval combining BM25 (keyword) and vector search (semantic)
"""
from __future__ import annotations

import logging
from typing import Any

from ollama import Client as OllamaClient
from rank_bm25 import BM25Okapi
from supabase import Client as SupabaseClient
from supabase import create_client

from src.settings import load_settings

logger = logging.getLogger(__name__)


def _get_clients() -> tuple[OllamaClient, SupabaseClient]:
    """Get Ollama and Supabase clients"""
    settings = load_settings()
    ollama_client = OllamaClient(host=settings.ollama_base_url)
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )
    return ollama_client, supabase_client


def bm25_search(query: str, k: int = 10) -> list[dict[str, Any]]:
    """
    BM25 keyword-based search on all legal chunks
    
    Args:
        query: Search query
        k: Number of results to return
        
    Returns:
        List of chunks with BM25 scores
    """
    _, supabase_client = _get_clients()
    
    # Fetch all chunks with text
    response = supabase_client.table("legal_chunks").select(
        "act_name,section_num,section_title,chunk_text,metadata"
    ).execute()
    
    if not response.data:
        return []
    
    chunks = response.data
    
    # Prepare corpus for BM25
    corpus = [chunk["chunk_text"].lower().split() for chunk in chunks]
    
    # Initialize BM25
    bm25 = BM25Okapi(corpus)
    
    # Tokenize query
    tokenized_query = query.lower().split()
    
    # Get BM25 scores
    scores = bm25.get_scores(tokenized_query)
    
    # Get top-k indices
    top_k_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
    
    # Build results
    results = []
    for idx in top_k_indices:
        if scores[idx] > 0:  # Only include chunks with positive scores
            results.append(
                {
                    "act_name": chunks[idx]["act_name"],
                    "section_num": chunks[idx]["section_num"],
                    "section_title": chunks[idx]["section_title"],
                    "chunk_text": chunks[idx]["chunk_text"],
                    "bm25_score": float(scores[idx]),
                    "metadata": chunks[idx].get("metadata", {}),
                }
            )
    
    return results


def vector_search(query: str, k: int = 5) -> list[dict[str, Any]]:
    """
    Vector semantic search using embeddings
    
    Args:
        query: Search query
        k: Number of results to return
        
    Returns:
        List of chunks with similarity scores
    """
    settings = load_settings()
    ollama_client, supabase_client = _get_clients()
    
    # Generate query embedding
    embedding_response = ollama_client.embed(model=settings.embed_model, input=query)
    query_embedding = embedding_response.get("embeddings", [[None]])[0]
    
    if not query_embedding:
        return []
    
    try:
        # Use Supabase RPC for vector similarity search
        rpc_response = (
            supabase_client.rpc(
                "match_legal_sections",
                {
                    "query_embedding": query_embedding,
                    "match_count": k,
                    "filter_act": None,
                },
            )
            .execute()
            .data
        )
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
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
                "metadata": row.get("metadata", {}),
            }
        )
    
    return results


def hybrid_search(
    query: str,
    k_vector: int = 5,
    k_bm25: int = 10,
    vector_weight: float = 0.6,
    bm25_weight: float = 0.4,
) -> list[dict[str, Any]]:
    """
    Hybrid search combining BM25 and vector search with weighted scoring
    
    Args:
        query: Search query
        k_vector: Number of vector results
        k_bm25: Number of BM25 results
        vector_weight: Weight for vector search scores (0-1)
        bm25_weight: Weight for BM25 scores (0-1)
        
    Returns:
        List of unique chunks ranked by hybrid score
    """
    # Get results from both methods
    vector_results = vector_search(query, k=k_vector)
    bm25_results = bm25_search(query, k=k_bm25)
    
    # Normalize scores and combine
    chunk_scores: dict[str, dict[str, Any]] = {}
    
    # Add vector results
    max_vector_sim = max([r.get("similarity", 0) for r in vector_results], default=1.0)
    for result in vector_results:
        key = f"{result['act_name']}:{result['section_num']}"
        norm_score = result.get("similarity", 0) / max_vector_sim if max_vector_sim > 0 else 0
        
        chunk_scores[key] = {
            **result,
            "hybrid_score": norm_score * vector_weight,
            "vector_score": norm_score,
            "bm25_score": 0.0,
        }
    
    # Add BM25 results
    max_bm25_score = max([r.get("bm25_score", 0) for r in bm25_results], default=1.0)
    for result in bm25_results:
        key = f"{result['act_name']}:{result['section_num']}"
        norm_score = result.get("bm25_score", 0) / max_bm25_score if max_bm25_score > 0 else 0
        
        if key in chunk_scores:
            # Chunk found in both - add BM25 score
            chunk_scores[key]["hybrid_score"] += norm_score * bm25_weight
            chunk_scores[key]["bm25_score"] = norm_score
        else:
            # New chunk from BM25 only
            chunk_scores[key] = {
                **result,
                "hybrid_score": norm_score * bm25_weight,
                "vector_score": 0.0,
                "bm25_score": norm_score,
            }
    
    # Sort by hybrid score
    ranked_results = sorted(
        chunk_scores.values(),
        key=lambda x: x["hybrid_score"],
        reverse=True
    )
    
    return ranked_results[:max(k_vector, k_bm25)]
