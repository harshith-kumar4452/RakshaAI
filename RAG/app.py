"""
Flask web application for JustRAG - Entity/Relationship Visualization & Chat
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, stream_with_context, Response
from flask_cors import CORS
from ollama import Client as OllamaClient
from supabase import Client as SupabaseClient
from supabase import create_client

from src.ingest.chunker import extract_chunks
from src.ingest.embedder import ingest_chunks_to_supabase
from src.retrieval.bm25_hybrid import hybrid_search
from src.settings import load_settings
from src.utils.legal_accuracy import (
    get_canonical_act_name,
    get_offense_clarification,
    prioritize_citations,
    get_reporting_guidance,
    format_citation_with_canonical_name,
    ENHANCED_SYSTEM_PROMPT,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "Data"

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state for ingestion progress
ingestion_state = {
    "status": "idle",  # idle, running, completed, error
    "current_act": None,
    "progress": {
        "total_acts": 0,
        "completed_acts": 0,
        "current_stage": None,
        "stages": {},
    },
    "logs": [],
    "started_at": None,
    "completed_at": None,
}


def get_supabase_client() -> SupabaseClient:
    """Get Supabase client"""
    settings = load_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


def log_progress(message: str, level: str = "info") -> None:
    """Log a progress message"""
    timestamp = datetime.now().isoformat()
    log_entry = {"timestamp": timestamp, "level": level, "message": message}
    ingestion_state["logs"].append(log_entry)
    logger.info(message)


def run_ingestion(act_files: list[str]) -> None:
    """Run the ingestion pipeline with live status updates"""
    global ingestion_state

    try:
        ingestion_state["status"] = "running"
        ingestion_state["started_at"] = datetime.now().isoformat()
        ingestion_state["progress"]["total_acts"] = len(act_files)
        ingestion_state["logs"] = []

        log_progress(f"Starting ingestion of {len(act_files)} acts")

        for idx, act_file in enumerate(act_files, 1):
            try:
                ingestion_state["current_act"] = act_file
                log_progress(f"[{idx}/{len(act_files)}] Processing {act_file}")

                # Stage 1: Chunking
                ingestion_state["progress"]["current_stage"] = "chunking"
                ingestion_state["progress"]["stages"][act_file] = {"chunking": "running"}
                log_progress(f"  → Stage 1/3: Chunking {act_file}")

                chunks = extract_chunks(act_file)
                log_progress(f"  ✓ Extracted {len(chunks)} chunks")
                ingestion_state["progress"]["stages"][act_file]["chunking"] = "completed"

                # Stage 2: Embedding + Entity Extraction
                ingestion_state["progress"]["current_stage"] = "embedding"
                ingestion_state["progress"]["stages"][act_file]["embedding"] = "running"
                log_progress(f"  → Stage 2/3: Embedding & entity extraction")

                result = ingest_chunks_to_supabase(chunks)
                log_progress(
                    f"  ✓ Processed {result['chunks_processed']} chunks, "
                    f"upserted {result['upserts']} rows"
                )
                ingestion_state["progress"]["stages"][act_file]["embedding"] = "completed"

                # Stage 3: Complete
                ingestion_state["progress"]["stages"][act_file]["status"] = "completed"
                ingestion_state["progress"]["completed_acts"] = idx
                log_progress(f"  ✓ Completed {act_file}")

            except Exception as e:
                error_msg = f"  ✗ Error processing {act_file}: {e}"
                log_progress(error_msg, "error")
                ingestion_state["progress"]["stages"][act_file] = {"status": "error", "error": str(e)}

        ingestion_state["status"] = "completed"
        ingestion_state["completed_at"] = datetime.now().isoformat()
        log_progress("✓ Ingestion pipeline completed successfully")

    except Exception as e:
        ingestion_state["status"] = "error"
        ingestion_state["completed_at"] = datetime.now().isoformat()
        log_progress(f"✗ Ingestion failed: {e}", "error")


@app.route("/")
def index():
    """Render the main page"""
    return render_template("index.html")


@app.route("/api/status")
def get_status():
    """Get current ingestion status"""
    return jsonify(ingestion_state)


@app.route("/api/start-ingestion", methods=["POST"])
def start_ingestion():
    """Start the ingestion process"""
    global ingestion_state

    if ingestion_state["status"] == "running":
        return jsonify({"error": "Ingestion already running"}), 400

    # Default acts to ingest
    act_files = [
        str(DATA_DIR / "BNS.md"),
        str(DATA_DIR / "ITAct2000.md"),
        str(DATA_DIR / "POSHACT2013.md"),
        str(DATA_DIR / "POCSOAct2012.md"),
        str(DATA_DIR / "cybercomplaint.md"),
    ]

    # Reset state
    ingestion_state = {
        "status": "idle",
        "current_act": None,
        "progress": {
            "total_acts": 0,
            "completed_acts": 0,
            "current_stage": None,
            "stages": {},
        },
        "logs": [],
        "started_at": None,
        "completed_at": None,
    }

    # Run ingestion in background thread
    thread = threading.Thread(target=run_ingestion, args=(act_files,), daemon=True)
    thread.start()

    return jsonify({"message": "Ingestion started", "status": "running"})


@app.route("/api/graph-data")
def get_graph_data():
    """Get entity-relationship graph data from all chunks"""
    try:
        supabase = get_supabase_client()

        # Fetch all chunks with metadata
        response = supabase.table("legal_chunks").select("act_name,section_num,section_title,metadata").execute()

        if not response.data:
            return jsonify({"nodes": [], "edges": []})

        nodes = []
        edges = []
        node_ids = set()

        for row in response.data:
            metadata = row.get("metadata", {})
            entities = metadata.get("entities", [])
            relationships = metadata.get("relationships", [])

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
            for entity in entities:
                entity_id = entity.get("id")
                if entity_id and entity_id not in node_ids:
                    nodes.append(
                        {
                            "id": entity_id,
                            "label": entity.get("name", entity_id),
                            "title": f"{entity.get('label', 'Entity')}: {entity.get('name', entity_id)}",
                            "group": entity.get("label", "Entity"),
                            "type": entity.get("label", "Entity"),
                        }
                    )
                    node_ids.add(entity_id)

                    # Connect entity to its section
                    edges.append({"from": section_id, "to": entity_id, "label": "CONTAINS", "arrows": "to"})

            # Add relationship edges
            for rel in relationships:
                from_id = rel.get("from_id")
                to_id = rel.get("to_id")
                rel_type = rel.get("type", "RELATED_TO")

                if from_id and to_id and from_id in node_ids and to_id in node_ids:
                    edges.append({"from": from_id, "to": to_id, "label": rel_type, "arrows": "to"})

        return jsonify({"nodes": nodes, "edges": edges, "total_chunks": len(response.data)})

    except Exception as e:
        logger.exception("Error fetching graph data")
        return jsonify({"error": str(e)}), 500


@app.route("/api/search-entities")
def search_entities():
    """Search entities by keyword"""
    try:
        query = request.args.get("q", "").lower()
        if not query:
            return jsonify({"results": []})

        supabase = get_supabase_client()
        response = supabase.table("legal_chunks").select("act_name,section_num,section_title,metadata").execute()

        results = []
        for row in response.data:
            metadata = row.get("metadata", {})
            entities = metadata.get("entities", [])

            for entity in entities:
                entity_name = entity.get("name", "").lower()
                entity_label = entity.get("label", "").lower()

                if query in entity_name or query in entity_label:
                    results.append(
                        {
                            "entity_id": entity.get("id"),
                            "entity_name": entity.get("name"),
                            "entity_type": entity.get("label"),
                            "act": row["act_name"],
                            "section": row["section_num"],
                            "section_title": row["section_title"],
                        }
                    )

        return jsonify({"results": results[:50]})  # Limit to 50 results

    except Exception as e:
        logger.exception("Error searching entities")
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats")
def get_stats():
    """Get database statistics"""
    try:
        supabase = get_supabase_client()
        response = supabase.table("legal_chunks").select("act_name,metadata").execute()

        if not response.data:
            return jsonify({"total_chunks": 0, "total_entities": 0, "total_relationships": 0, "acts": {}})

        acts = {}
        total_entities = 0
        total_relationships = 0

        for row in response.data:
            act_name = row["act_name"]
            metadata = row.get("metadata", {})

            if act_name not in acts:
                acts[act_name] = {"chunks": 0, "entities": 0, "relationships": 0}

            acts[act_name]["chunks"] += 1
            acts[act_name]["entities"] += len(metadata.get("entities", []))
            acts[act_name]["relationships"] += len(metadata.get("relationships", []))

            total_entities += len(metadata.get("entities", []))
            total_relationships += len(metadata.get("relationships", []))

        return jsonify(
            {
                "total_chunks": len(response.data),
                "total_entities": total_entities,
                "total_relationships": total_relationships,
                "acts": acts,
            }
        )

    except Exception as e:
        logger.exception("Error fetching stats")
        return jsonify({"error": str(e)}), 500


@app.route("/chat")
def chat_page():
    """Render the chat interface"""
    return render_template("chat.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Chat endpoint with hybrid BM25 + vector retrieval and legal accuracy fixes
    
    Request body:
    {
        "message": "user question",
        "k_vector": 5,  # optional
        "k_bm25": 10,   # optional
        "stream": true  # optional
    }
    """
    try:
        data = request.get_json()
        if not data or "message" not in data:
            return jsonify({"error": "Missing 'message' field"}), 400
        
        user_message = data["message"]
        k_vector = data.get("k_vector", 5)
        k_bm25 = data.get("k_bm25", 10)
        use_stream = data.get("stream", False)
        
        # Retrieve relevant chunks using hybrid search
        logger.info(f"Chat query: {user_message}")
        retrieved_chunks = hybrid_search(
            query=user_message,
            k_vector=k_vector,
            k_bm25=k_bm25,
        )
        
        # FIX 1: Check for offense clarifications (e.g., cyberstalking)
        offense_clarification = get_offense_clarification(user_message)
        
        # FIX 3: Prioritize citations into primary and secondary
        prioritized = prioritize_citations(retrieved_chunks[:10], user_message)
        primary_chunks = prioritized["primary"][:3]  # Top 3 primary
        secondary_chunks = prioritized["secondary"][:2]  # Top 2 secondary
        
        # Build context with canonical names and prioritization
        context_parts = []
        sources = []
        
        # Add offense clarification if found
        if offense_clarification:
            context_parts.append(f"IMPORTANT CLARIFICATION:\n{offense_clarification['clarification']}\n")
        
        # Primary citations
        if primary_chunks:
            context_parts.append("PRIMARY LEGAL PROVISIONS:")
            for idx, chunk in enumerate(primary_chunks, 1):
                canonical_name = get_canonical_act_name(chunk['act_name'])
                context_parts.append(
                    f"[Primary {idx}] {canonical_name}, Section {chunk['section_num']}\n"
                    f"{chunk['section_title']}\n"
                    f"{chunk['chunk_text']}\n"
                )
                sources.append({
                    "act": canonical_name,  # FIX 1: Use canonical name
                    "section": chunk["section_num"],
                    "title": chunk["section_title"],
                    "priority": "primary",
                    "hybrid_score": round(chunk.get("hybrid_score", 0), 3),
                    "vector_score": round(chunk.get("vector_score", 0), 3),
                    "bm25_score": round(chunk.get("bm25_score", 0), 3),
                })
        
        # Secondary citations
        if secondary_chunks:
            context_parts.append("\nSECONDARY/RELATED PROVISIONS:")
            for idx, chunk in enumerate(secondary_chunks, 1):
                canonical_name = get_canonical_act_name(chunk['act_name'])
                context_parts.append(
                    f"[Secondary {idx}] {canonical_name}, Section {chunk['section_num']}\n"
                    f"{chunk['section_title']}\n"
                    f"{chunk['chunk_text']}\n"
                )
                sources.append({
                    "act": canonical_name,  # FIX 1: Use canonical name
                    "section": chunk["section_num"],
                    "title": chunk["section_title"],
                    "priority": "secondary",
                    "hybrid_score": round(chunk.get("hybrid_score", 0), 3),
                    "vector_score": round(chunk.get("vector_score", 0), 3),
                    "bm25_score": round(chunk.get("bm25_score", 0), 3),
                })
        
        context = "\n---\n".join(context_parts) if context_parts else "No relevant legal sections found."
        
        # FIX 4: Get reporting guidance
        reporting_guidance = get_reporting_guidance(user_message)
        if reporting_guidance:
            context += f"\n\nREPORTING GUIDANCE:\n{reporting_guidance}"
        
        # FIX 2: Use enhanced system prompt with all fixes
        system_prompt = ENHANCED_SYSTEM_PROMPT
        
        user_prompt = f"""Legal Context:
{context}

User Question: {user_message}

Please provide a helpful, accurate response based on the legal context above. Remember to:
1. Use canonical statute names (e.g., "Bharatiya Nyaya Sanhita (BNS), 2023")
2. Cite primary provisions first, then mention secondary ones as "Additionally, if..."
3. Be precise about terminology (e.g., cyberstalking is part of stalking under BNS 78)
4. Include reporting guidance where applicable"""

        # Get response from Qwen2.5
        settings = load_settings()
        ollama_client = OllamaClient(host=settings.ollama_base_url)
        
        if use_stream:
            def generate():
                response_stream = ollama_client.chat(
                    model=settings.llm_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    stream=True,
                    options={"temperature": 0.3},
                )
                
                for chunk in response_stream:
                    if "message" in chunk and "content" in chunk["message"]:
                        yield f"data: {json.dumps({'content': chunk['message']['content']})}\n\n"
                
                # Send sources at the end
                yield f"data: {json.dumps({'sources': sources})}\n\n"
                yield "data: [DONE]\n\n"
            
            return Response(stream_with_context(generate()), mimetype="text/event-stream")
        
        else:
            response = ollama_client.chat(
                model=settings.llm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                options={"temperature": 0.3},
            )
            
            answer = response["message"]["content"]
            
            return jsonify({
                "answer": answer,
                "sources": sources,
                "retrieved_chunks": len(retrieved_chunks),
                "clarification": offense_clarification.get("clarification") if offense_clarification else None,
            })
    
    except Exception as e:
        logger.exception("Error in chat endpoint")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
