from __future__ import annotations

import json
import logging
import re
from typing import Any

from neo4j import GraphDatabase
from ollama import Client


logger = logging.getLogger(__name__)

ALLOWED_LABELS = {
    "Act",
    "Section",
    "Offence",
    "Punishment",
    "Authority",
    "Victim",
    "Platform",
}

ALLOWED_RELATIONSHIPS = {
    "CONTAINS",
    "DEFINES",
    "PRESCRIBES",
    "HANDLED_BY",
    "PROTECTS",
    "APPLIES_TO",
    "MANDATES",
    "SUPPLEMENTS",
    "SUPERSEDES",
}


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def _extract_json(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output")

    return json.loads(cleaned[start : end + 1])


def _build_prompt(chunk: dict[str, Any]) -> str:
    return (
        "You are an expert legal knowledge graph builder specializing in Indian law, "
        "particularly harassment and cybercrime legislation.\n\n"
        "TASK: Extract structured entities and relationships from the given legal text.\n\n"
        "ENTITY TYPES (label field):\n"
        "- Act: The legislation itself\n"
        "- Section: A specific section within an act\n"
        "- Offence: Criminal offenses or violations (e.g., 'Sexual Harassment', 'Stalking', 'Identity Theft')\n"
        "- Punishment: Penalties like imprisonment terms, fines (e.g., '3 years imprisonment')\n"
        "- Authority: Organizations handling complaints (e.g., 'Internal Committee', 'Police', 'Court')\n"
        "- Victim: Types of victims protected (e.g., 'Aggrieved Woman', 'Child', 'Employee')\n"
        "- Platform: Digital platforms where offenses occur (e.g., 'Social Media', 'Workplace', 'Email')\n\n"
        "RELATIONSHIP TYPES:\n"
        "- CONTAINS: Act contains Section\n"
        "- DEFINES: Section defines Offence\n"
        "- PRESCRIBES: Section prescribes Punishment\n"
        "- HANDLED_BY: Offence handled by Authority\n"
        "- PROTECTS: Act/Section protects Victim\n"
        "- APPLIES_TO: Offence applies to Platform\n"
        "- MANDATES: Section mandates reporting/action\n"
        "- SUPPLEMENTS: Act supplements another Act\n"
        "- SUPERSEDES: Act supersedes another Act\n\n"
        "EXTRACTION GUIDELINES:\n"
        "1. Extract concrete, specific entities - avoid vague terms\n"
        "2. Use clear, descriptive names for offences and punishments\n"
        "3. Identify all relevant authorities mentioned\n"
        "4. Note victim categories explicitly stated\n"
        "5. Capture digital platforms if mentioned\n"
        "6. Create relationships that capture legal logic\n\n"
        "OUTPUT FORMAT (strict JSON only, no markdown, no explanation):\n"
        "{\n"
        '  "entities": [\n'
        '    {"id": "harassment_workplace", "label": "Offence", "name": "Sexual Harassment at Workplace", "properties": {"severity": "high"}}\n'
        "  ],\n"
        '  "relationships": [\n'
        '    {"from_id": "section_354a", "to_id": "harassment_workplace", "type": "DEFINES", "properties": {}}\n'
        "  ]\n"
        "}\n\n"
        "--- LEGAL TEXT TO ANALYZE ---\n\n"
        f"Act: {chunk['act_name']}\n"
        f"Section {chunk['section_num']}: {chunk['section_title']}\n\n"
        f"{chunk['chunk_text']}\n\n"
        "--- END TEXT ---\n\n"
        "Extract entities and relationships as JSON:"
    )


def _sanitize_graph(payload: dict[str, Any], act_name: str) -> dict[str, Any]:
    prefix = _slug(act_name)
    entities: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []

    for entity in payload.get("entities", []):
        label = str(entity.get("label", "")).strip()
        if label not in ALLOWED_LABELS:
            continue

        entity_id = str(entity.get("id", "")).strip()
        if not entity_id:
            continue

        full_id = f"{prefix}:{entity_id}"
        entities.append(
            {
                "id": full_id,
                "label": label,
                "name": str(entity.get("name", "")).strip() or entity_id,
                "properties": entity.get("properties", {}) if isinstance(entity.get("properties"), dict) else {},
            }
        )

    valid_ids = {entity["id"] for entity in entities}
    for rel in payload.get("relationships", []):
        rel_type = str(rel.get("type", "")).strip().upper()
        if rel_type not in ALLOWED_RELATIONSHIPS:
            continue

        from_id = f"{prefix}:{str(rel.get('from_id', '')).strip()}"
        to_id = f"{prefix}:{str(rel.get('to_id', '')).strip()}"

        if not from_id or not to_id or from_id not in valid_ids or to_id not in valid_ids:
            continue

        relationships.append(
            {
                "from_id": from_id,
                "to_id": to_id,
                "type": rel_type,
                "properties": rel.get("properties", {}) if isinstance(rel.get("properties"), dict) else {},
            }
        )

    return {"entities": entities, "relationships": relationships}


def extract_entities(
    chunk: dict[str, Any],
    llm_model: str,
    ollama_base_url: str = "http://localhost:11434",
    retry_once: bool = True,
) -> dict[str, Any]:
    client = Client(host=ollama_base_url)
    prompt = _build_prompt(chunk)
    strict_retry_prompt = (
        prompt
        + "\n\nIMPORTANT: Output MUST be parseable JSON and must include both keys: entities and relationships."
    )

    last_error: Exception | None = None
    attempts = [prompt, strict_retry_prompt] if retry_once else [prompt]

    for attempt in attempts:
        try:
            response = client.chat(
                model=llm_model,
                messages=[{"role": "user", "content": attempt}],
                options={"temperature": 0},
            )
            content = response["message"]["content"]
            parsed = _extract_json(content)
            return _sanitize_graph(parsed, chunk["act_name"])
        except Exception as exc:
            last_error = exc

    raise ValueError(f"Entity extraction failed: {last_error}")


def upsert_to_neo4j(
    chunk: dict[str, Any],
    graph_payload: dict[str, Any],
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
) -> None:
    if not (neo4j_uri and neo4j_user and neo4j_password):
        raise ValueError("Neo4j credentials are incomplete")

    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    try:
        with driver.session() as session:
            session.run(
                """
                MERGE (a:Act {name: $act_name})
                MERGE (s:Section {act_name: $act_name, section_num: $section_num})
                SET s.section_title = $section_title
                MERGE (a)-[:CONTAINS]->(s)
                """,
                act_name=chunk["act_name"],
                section_num=chunk["section_num"],
                section_title=chunk["section_title"],
            )

            for entity in graph_payload.get("entities", []):
                label = entity["label"]
                if label not in ALLOWED_LABELS:
                    continue

                session.run(
                    f"""
                    MERGE (e:Entity {{id: $id}})
                    SET e.name = $name
                    SET e += $properties
                    SET e:{label}
                    """,
                    id=entity["id"],
                    name=entity["name"],
                    properties=entity.get("properties", {}),
                )

            for rel in graph_payload.get("relationships", []):
                rel_type = rel["type"]
                if rel_type not in ALLOWED_RELATIONSHIPS:
                    continue

                session.run(
                    f"""
                    MATCH (from:Entity {{id: $from_id}})
                    MATCH (to:Entity {{id: $to_id}})
                    MERGE (from)-[r:{rel_type}]->(to)
                    SET r += $properties
                    """,
                    from_id=rel["from_id"],
                    to_id=rel["to_id"],
                    properties=rel.get("properties", {}),
                )
    except Exception:
        logger.exception(
            "Neo4j upsert failed for %s section %s",
            chunk.get("act_name"),
            chunk.get("section_num"),
        )
        raise
    finally:
        driver.close()
