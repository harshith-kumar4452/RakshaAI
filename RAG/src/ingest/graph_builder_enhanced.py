"""
Enhanced graph builder with rich metadata schema and confidence scoring
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
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

CATEGORY_KEYWORDS = {
    "sexual_harassment": ["sexual", "harassment", "modesty", "voyeurism", "unwelcome", "consent"],
    "cybercrime": ["cyber", "computer", "internet", "electronic", "digital", "online", "data"],
    "minor_protection": ["child", "minor", "below 18", "juvenile", "adolescent", "grooming"],
    "workplace": ["workplace", "employer", "employee", "organisation", "internal committee"],
    "stalking": ["stalk", "follow", "monitor", "contact", "persistence"],
}

SEVERITY_KEYWORDS = {
    "critical": ["death", "life imprisonment", "rigorous imprisonment"],
    "high": ["imprisonment", "cognizable", "non-bailable", "punishable"],
    "medium": ["fine", "bailable", "compensation"],
    "low": ["warning", "administrative", "complaint"],
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


def _classify_category(chunk_text: str) -> str:
    """Classify the legal section into a category based on keywords"""
    text_lower = chunk_text.lower()

    category_scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in text_lower)
        if score > 0:
            category_scores[category] = score

    if category_scores:
        return max(category_scores, key=category_scores.get)
    return "general"


def _classify_severity(chunk_text: str) -> str:
    """Classify severity based on punishment keywords"""
    text_lower = chunk_text.lower()

    for severity, keywords in SEVERITY_KEYWORDS.items():
        if any(keyword in text_lower for keyword in keywords):
            return severity

    return "medium"


def _detect_keywords(chunk_text: str) -> list[str]:
    """Extract important keywords from the chunk"""
    all_keywords = set()
    text_lower = chunk_text.lower()

    for keywords in CATEGORY_KEYWORDS.values():
        for keyword in keywords:
            if keyword in text_lower:
                all_keywords.add(keyword)

    return sorted(list(all_keywords))[:10]  # Top 10 keywords


def _extract_penalties(chunk_text: str) -> dict[str, Any]:
    """Extract penalty information using regex"""
    penalties = {
        "imprisonment_min_years": None,
        "imprisonment_max_years": None,
        "fine_min": None,
        "fine_max": None,
        "description": None,
    }

    # Extract imprisonment years
    imprisonment_pattern = r"imprisonment.*?(\d+)\s*(?:to|or)\s*(\d+)\s*years?"
    match = re.search(imprisonment_pattern, chunk_text, re.IGNORECASE)
    if match:
        penalties["imprisonment_min_years"] = int(match.group(1))
        penalties["imprisonment_max_years"] = int(match.group(2))
    else:
        simple_pattern = r"imprisonment.*?(\d+)\s*years?"
        match = re.search(simple_pattern, chunk_text, re.IGNORECASE)
        if match:
            penalties["imprisonment_max_years"] = int(match.group(1))

    # Extract fine amounts
    fine_pattern = r"fine.*?(?:Rs\.?|₹)\s*(\d+(?:,\d+)*)"
    match = re.search(fine_pattern, chunk_text, re.IGNORECASE)
    if match:
        fine_amount = int(match.group(1).replace(",", ""))
        penalties["fine_max"] = fine_amount

    # Extract description
    punishment_section = re.search(
        r"(punishable with.*?\.)",
        chunk_text,
        re.IGNORECASE | re.DOTALL,
    )
    if punishment_section:
        penalties["description"] = punishment_section.group(1).strip()[:200]

    return penalties


def _build_enhanced_prompt(chunk: dict[str, Any]) -> str:
    """Enhanced prompt with confidence scoring and structured output"""
    return (
        "You are an expert legal knowledge graph builder for Indian harassment and cybercrime law.\n\n"
        "TASK: Extract structured entities and relationships from the legal text below.\n"
        "For EACH entity and relationship, estimate a CONFIDENCE SCORE (0.0 to 1.0).\n\n"
        "=== ENTITY TYPES ===\n"
        "- Offence: Criminal offenses (e.g., 'Sexual Harassment', 'Cyberstalking', 'Identity Theft')\n"
        "  Properties: severity (low/medium/high/critical), cognizable (true/false), bailable (true/false)\n\n"
        "- Punishment: Penalties (e.g., 'Imprisonment up to 3 years', 'Fine up to Rs 50,000')\n"
        "  Properties: imprisonment_years (int), fine_amount (int), type (imprisonment/fine/both)\n\n"
        "- Authority: Organizations handling complaints (e.g., 'Police', 'Internal Committee', 'District Court')\n"
        "  Properties: jurisdiction (local/state/national), type (police/court/committee)\n\n"
        "- Victim: Protected victim categories (e.g., 'Woman', 'Child under 18', 'Employee')\n"
        "  Properties: age_restriction (int or null), gender_specific (true/false)\n\n"
        "- Platform: Digital platforms (e.g., 'Social Media', 'Email', 'Workplace Computer System')\n"
        "  Properties: digital (true/false), physical (true/false)\n\n"
        "- Section: Legal section references (e.g., 'Section 354A', 'Section 67 IT Act')\n"
        "  Properties: act_name, section_num\n\n"
        "- Act: Legislation (e.g., 'BNS 2023', 'POSH Act 2013')\n"
        "  Properties: year (int)\n\n"
        "=== RELATIONSHIP TYPES ===\n"
        "- DEFINES: Section defines Offence (e.g., Section 354A DEFINES Sexual Harassment)\n"
        "- PRESCRIBES: Offence prescribes Punishment (e.g., Stalking PRESCRIBES 3 years imprisonment)\n"
        "- HANDLED_BY: Offence handled by Authority (e.g., Cybercrime HANDLED_BY Cyber Cell)\n"
        "- PROTECTS: Law protects Victim (e.g., POSH Act PROTECTS Women employees)\n"
        "- APPLIES_TO: Offence applies to Platform (e.g., Cyberbullying APPLIES_TO Social Media)\n"
        "- MANDATES: Section mandates action (e.g., POCSO MANDATES mandatory reporting)\n"
        "- SUPPLEMENTS: Act supplements another Act\n"
        "- SUPERSEDES: Act supersedes another Act\n\n"
        "=== EXTRACTION RULES ===\n"
        "1. Extract CONCRETE entities only - no vague terms\n"
        "2. Use descriptive names (e.g., 'Sexual Harassment at Workplace', not 'offense1')\n"
        "3. Estimate confidence: 1.0 = explicitly stated, 0.5 = implied, 0.3 = uncertain\n"
        "4. Include entity mentions with character positions if possible\n"
        "5. Extract ALL authorities mentioned (Police, Courts, Committees, etc.)\n"
        "6. Note victim age restrictions if mentioned (e.g., 'child below 18 years')\n"
        "7. For punishments, extract exact imprisonment duration and fine amounts\n\n"
        "=== OUTPUT FORMAT (STRICT JSON) ===\n"
        "Return ONLY valid JSON. No markdown fences. No explanation.\n\n"
        "{\n"
        '  "entities": [\n'
        "    {\n"
        '      "id": "short_unique_id",\n'
        '      "label": "Offence",\n'
        '      "name": "Sexual Harassment at Workplace",\n'
        '      "confidence": 0.95,\n'
        '      "properties": {"severity": "high", "cognizable": true, "bailable": false},\n'
        '      "mentions": [{"text": "sexual harassment", "start_char": 45, "end_char": 62}]\n'
        "    }\n"
        "  ],\n"
        '  "relationships": [\n'
        "    {\n"
        '      "from_id": "section_354a",\n'
        '      "to_id": "sexual_harassment",\n'
        '      "type": "DEFINES",\n'
        '      "confidence": 0.98,\n'
        '      "properties": {"source_line": "Section 354A defines...", "relationship_strength": "strong"}\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "=== LEGAL TEXT ===\n\n"
        f"Act: {chunk['act_name']}\n"
        f"Section {chunk['section_num']}: {chunk['section_title']}\n\n"
        f"{chunk['chunk_text']}\n\n"
        "=== END TEXT ===\n\n"
        "Extract entities and relationships as JSON:"
    )


def _sanitize_graph(payload: dict[str, Any], act_name: str) -> dict[str, Any]:
    """Sanitize and validate extracted graph data with confidence scores"""
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
                "confidence": float(entity.get("confidence", 0.8)),
                "properties": entity.get("properties", {}) if isinstance(entity.get("properties"), dict) else {},
                "mentions": entity.get("mentions", []) if isinstance(entity.get("mentions"), list) else [],
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
                "confidence": float(rel.get("confidence", 0.8)),
                "properties": rel.get("properties", {}) if isinstance(rel.get("properties"), dict) else {},
            }
        )

    return {"entities": entities, "relationships": relationships}


def build_rich_metadata(
    chunk: dict[str, Any],
    graph_payload: dict[str, Any],
    extraction_time_ms: int,
    llm_model: str,
) -> dict[str, Any]:
    """Build comprehensive metadata following the enhanced schema"""

    chunk_text = chunk.get("chunk_text", "")

    metadata = {
        "extraction": {
            "model": llm_model,
            "timestamp": datetime.utcnow().isoformat(),
            "confidence": sum(e.get("confidence", 0.8) for e in graph_payload.get("entities", []))
            / max(len(graph_payload.get("entities", [])), 1),
            "extraction_time_ms": extraction_time_ms,
        },
        "classification": {
            "category": _classify_category(chunk_text),
            "severity": _classify_severity(chunk_text),
            "keywords": _detect_keywords(chunk_text),
            "jurisdiction": "criminal" if "punishable" in chunk_text.lower() else "civil",
            "age_restricted": any(
                keyword in chunk_text.lower() for keyword in ["child", "minor", "below 18", "juvenile"]
            ),
            "mandatory_reporting": any(
                keyword in chunk_text.lower() for keyword in ["mandatory", "shall report", "must report"]
            ),
        },
        "entities": graph_payload.get("entities", []),
        "relationships": graph_payload.get("relationships", []),
        "legal_references": {
            "cross_references": _extract_cross_references(chunk_text),
            "supersedes": [],
            "case_law": [],
        },
        "penalties": _extract_penalties(chunk_text),
        "authorities": _extract_authorities(graph_payload),
        "victims": _extract_victims(graph_payload),
    }

    return metadata


def _extract_cross_references(chunk_text: str) -> list[str]:
    """Extract cross-references to other sections"""
    pattern = r"(?:Section|sec\.?|§)\s*(\d+[A-Z]?)"
    matches = re.findall(pattern, chunk_text, re.IGNORECASE)
    return list(set(matches))[:5]  # Limit to 5 unique references


def _extract_authorities(graph_payload: dict[str, Any]) -> dict[str, Any]:
    """Extract authority information from entities"""
    authorities = {
        "primary": [],
        "secondary": [],
        "reporting_timeline_days": None,
    }

    for entity in graph_payload.get("entities", []):
        if entity.get("label") == "Authority":
            authorities["primary"].append(entity.get("name"))

    return authorities


def _extract_victims(graph_payload: dict[str, Any]) -> dict[str, Any]:
    """Extract victim information from entities"""
    victims = {
        "protected_categories": [],
        "age_restrictions": None,
        "special_provisions": [],
    }

    for entity in graph_payload.get("entities", []):
        if entity.get("label") == "Victim":
            victims["protected_categories"].append(entity.get("name"))
            props = entity.get("properties", {})
            if "age_restriction" in props:
                victims["age_restrictions"] = props["age_restriction"]

    return victims


def extract_entities_with_metadata(
    chunk: dict[str, Any],
    llm_model: str,
    ollama_base_url: str = "http://localhost:11434",
    retry_once: bool = True,
) -> dict[str, Any]:
    """
    Extract entities and build rich metadata
    Returns: Rich metadata dict following enhanced schema
    """
    import time

    start_time = time.time()

    client = Client(host=ollama_base_url)
    prompt = _build_enhanced_prompt(chunk)
    strict_retry_prompt = (
        prompt
        + "\n\nIMPORTANT: Output MUST be valid JSON with 'entities' and 'relationships' arrays. "
        "Each entity MUST have 'id', 'label', 'name', 'confidence' fields."
    )

    last_error: Exception | None = None
    attempts = [prompt, strict_retry_prompt] if retry_once else [prompt]

    graph_payload = {"entities": [], "relationships": []}

    for attempt in attempts:
        try:
            response = client.chat(
                model=llm_model,
                messages=[{"role": "user", "content": attempt}],
                options={"temperature": 0},
            )
            content = response["message"]["content"]
            parsed = _extract_json(content)
            graph_payload = _sanitize_graph(parsed, chunk["act_name"])
            break  # Success
        except Exception as exc:
            last_error = exc
            logger.warning(f"Extraction attempt failed: {exc}")

    extraction_time_ms = int((time.time() - start_time) * 1000)

    # Build rich metadata even if extraction partially failed
    metadata = build_rich_metadata(chunk, graph_payload, extraction_time_ms, llm_model)

    if last_error and not graph_payload.get("entities"):
        metadata["extraction"]["error"] = str(last_error)

    return metadata


# Backward compatible function name
def extract_entities(
    chunk: dict[str, Any],
    llm_model: str,
    ollama_base_url: str = "http://localhost:11434",
    retry_once: bool = True,
) -> dict[str, Any]:
    """
    Backward compatible wrapper
    Returns: Simple entities/relationships dict for basic usage
    """
    metadata = extract_entities_with_metadata(chunk, llm_model, ollama_base_url, retry_once)
    return {"entities": metadata.get("entities", []), "relationships": metadata.get("relationships", [])}


def upsert_to_neo4j(
    chunk: dict[str, Any],
    graph_payload: dict[str, Any],
    neo4j_uri: str,
    neo4j_user: str,
    neo4j_password: str,
) -> None:
    """Upsert entities and relationships to Neo4j (optional for GraphRAG)"""
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
                    SET e.confidence = $confidence
                    SET e += $properties
                    SET e:{label}
                    """,
                    id=entity["id"],
                    name=entity["name"],
                    confidence=entity.get("confidence", 0.8),
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
                    SET r.confidence = $confidence
                    SET r += $properties
                    """,
                    from_id=rel["from_id"],
                    to_id=rel["to_id"],
                    confidence=rel.get("confidence", 0.8),
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
