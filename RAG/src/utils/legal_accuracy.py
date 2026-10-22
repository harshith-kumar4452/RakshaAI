"""
Legal accuracy fixes for RAG system to prevent hallucinations and improve citation quality
"""
from __future__ import annotations

from typing import Any

# 1. CANONICAL STATUTE NAMES - Prevent hallucinations
CANONICAL_ACT_NAMES = {
    "BNS 2023": "Bharatiya Nyaya Sanhita (BNS), 2023",
    "BNS": "Bharatiya Nyaya Sanhita (BNS), 2023",
    "IT Act 2000": "Information Technology Act, 2000",
    "IT Act": "Information Technology Act, 2000",
    "POSH Act 2013": "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
    "POSH Act": "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
    "POCSO Act 2012": "Protection of Children from Sexual Offences (POCSO) Act, 2012",
    "POCSO Act": "Protection of Children from Sexual Offences (POCSO) Act, 2012",
    "IPC": "Indian Penal Code, 1860",
}

# 2. OFFENSE-SPECIFIC TERMINOLOGY CLARIFICATIONS
OFFENSE_CLARIFICATIONS = {
    "cyberstalking": {
        "primary_statute": "BNS 2023",
        "primary_section": "78",
        "clarification": "The offence of stalking, including cyberstalking (monitoring internet/email/electronic communication), is covered under Section 78 of the Bharatiya Nyaya Sanhita (BNS), 2023.",
        "keywords": ["cyberstalking", "cyber stalking", "online stalking", "stalking online"],
    },
    "stalking": {
        "primary_statute": "BNS 2023",
        "primary_section": "78",
        "clarification": "Stalking, including following, contacting, or monitoring via electronic means, is defined under Section 78 of the Bharatiya Nyaya Sanhita (BNS), 2023.",
        "keywords": ["stalking", "following", "monitoring"],
    },
    "sexual_harassment_workplace": {
        "primary_statute": "POSH Act 2013",
        "primary_section": "various",
        "clarification": "Sexual harassment at workplace is governed by the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013.",
        "keywords": ["workplace harassment", "sexual harassment at work", "office harassment"],
    },
}

# 3. CITATION PRIORITY RULES
CITATION_PRIORITY_RULES = {
    "cyberstalking": {
        "primary": ["BNS 2023:78"],
        "secondary_if_context": {
            "obscene_content": ["IT Act 2000:67", "IT Act 2000:67A"],
            "child_victim": ["POCSO Act 2012:11", "POCSO Act 2012:12"],
            "sexual_content": ["BNS 2023:75", "BNS 2023:76"],
        },
    },
    "stalking": {
        "primary": ["BNS 2023:78"],
        "secondary_if_context": {
            "sexual_intent": ["BNS 2023:75"],
            "child_victim": ["POCSO Act 2012:11"],
        },
    },
    "sexual_harassment": {
        "primary": ["POSH Act 2013:various", "BNS 2023:75"],
        "secondary_if_context": {
            "workplace": ["POSH Act 2013:various"],
            "child_victim": ["POCSO Act 2012:11", "POCSO Act 2012:12"],
        },
    },
    "cyberbullying": {
        "primary": ["IT Act 2000:66A", "IT Act 2000:66E"],
        "secondary_if_context": {
            "threatening": ["BNS 2023:351"],
            "defamation": ["BNS 2023:356"],
            "child_victim": ["POCSO Act 2012:11"],
        },
    },
}

# 4. REPORTING PORTAL RULES
REPORTING_PORTALS = {
    "cyber_crime": {
        "url": "https://cybercrime.gov.in",
        "name": "National Cyber Crime Reporting Portal",
        "applies_to": [
            "cyberstalking",
            "cyberbullying",
            "online harassment",
            "identity theft",
            "obscene content",
            "cyber threats",
        ],
        "recommendation": "Victims are advised to report such incidents via the National Cyber Crime Reporting Portal (https://cybercrime.gov.in).",
    },
    "posh_committee": {
        "name": "Internal Complaints Committee (ICC) or Local Complaints Committee",
        "applies_to": ["workplace sexual harassment", "office harassment"],
        "recommendation": "File a complaint with your organization's Internal Complaints Committee (ICC) within 3 months of the incident.",
    },
    "police": {
        "name": "Local Police Station",
        "applies_to": ["all criminal offences", "child abuse", "sexual assault", "stalking"],
        "recommendation": "File an FIR at your nearest police station immediately.",
    },
}


def get_canonical_act_name(act_shorthand: str) -> str:
    """
    Get the canonical full name of an act to prevent hallucinations
    
    Args:
        act_shorthand: Short form like "BNS 2023" or "IT Act"
        
    Returns:
        Full canonical name
    """
    return CANONICAL_ACT_NAMES.get(act_shorthand, act_shorthand)


def get_offense_clarification(query: str) -> dict[str, Any] | None:
    """
    Check if query contains an offense that needs clarification
    
    Args:
        query: User query text
        
    Returns:
        Clarification dict or None
    """
    query_lower = query.lower()
    
    for offense_type, details in OFFENSE_CLARIFICATIONS.items():
        if any(keyword in query_lower for keyword in details["keywords"]):
            return details
    
    return None


def prioritize_citations(
    retrieved_chunks: list[dict[str, Any]], query: str
) -> dict[str, list[dict[str, Any]]]:
    """
    Separate citations into primary and secondary based on priority rules
    
    Args:
        retrieved_chunks: List of retrieved chunks with act_name and section_num
        query: User query to determine context
        
    Returns:
        Dict with 'primary' and 'secondary' citation lists
    """
    query_lower = query.lower()
    
    # Detect offense type from query
    offense_type = None
    for offense, rules in CITATION_PRIORITY_RULES.items():
        if offense.replace("_", " ") in query_lower or offense in query_lower:
            offense_type = offense
            break
    
    if not offense_type:
        # No specific rules, return all as primary
        return {"primary": retrieved_chunks, "secondary": []}
    
    rules = CITATION_PRIORITY_RULES[offense_type]
    primary_patterns = rules.get("primary", [])
    secondary_contexts = rules.get("secondary_if_context", {})
    
    primary_citations = []
    secondary_citations = []
    
    for chunk in retrieved_chunks:
        chunk_key = f"{chunk['act_name']}:{chunk['section_num']}"
        
        # Check if it's a primary citation
        is_primary = False
        for pattern in primary_patterns:
            act_pattern, section_pattern = pattern.split(":")
            if act_pattern in chunk["act_name"] and (
                section_pattern == "various" or section_pattern in chunk["section_num"]
            ):
                is_primary = True
                break
        
        if is_primary:
            primary_citations.append(chunk)
        else:
            # Check if it matches secondary context
            is_secondary = False
            for context_type, patterns in secondary_contexts.items():
                if context_type.replace("_", " ") in query_lower:
                    for pattern in patterns:
                        act_pattern, section_pattern = pattern.split(":")
                        if act_pattern in chunk["act_name"] and section_pattern in chunk["section_num"]:
                            is_secondary = True
                            break
            
            if is_secondary:
                secondary_citations.append(chunk)
            else:
                # Add to secondary by default if not primary
                secondary_citations.append(chunk)
    
    return {"primary": primary_citations, "secondary": secondary_citations}


def get_reporting_guidance(query: str) -> str | None:
    """
    Get reporting portal guidance based on query context
    
    Args:
        query: User query text
        
    Returns:
        Reporting recommendation string or None
    """
    query_lower = query.lower()
    
    # Check each portal's applicability
    for portal_type, portal_info in REPORTING_PORTALS.items():
        applies_to = portal_info.get("applies_to", [])
        if any(keyword in query_lower for keyword in applies_to):
            return portal_info.get("recommendation")
    
    return None


def format_citation_with_canonical_name(act_name: str, section_num: str, title: str) -> str:
    """
    Format citation with canonical act name
    
    Args:
        act_name: Short act name (e.g., "BNS 2023")
        section_num: Section number
        title: Section title
        
    Returns:
        Formatted citation with canonical name
    """
    canonical_name = get_canonical_act_name(act_name)
    return f"{canonical_name}, Section {section_num}: {title}"


# ENHANCED SYSTEM PROMPT WITH FIXES
ENHANCED_SYSTEM_PROMPT = """You are Justra, an AI legal assistant specializing in Indian law, particularly harassment, cybercrime, and child protection laws.

CRITICAL RULES - ALWAYS FOLLOW:

1. STATUTE NAMES - Use canonical names only:
   - "BNS 2023" → "Bharatiya Nyaya Sanhita (BNS), 2023"
   - "IT Act 2000" → "Information Technology Act, 2000"
   - "POCSO Act 2012" → "Protection of Children from Sexual Offences (POCSO) Act, 2012"
   - "POSH Act 2013" → "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013"
   - NEVER invent statute names like "Bombay National Security Act"

2. CYBERSTALKING TERMINOLOGY:
   - "Cyberstalking" is NOT a separate statute
   - Correct: "The offence of stalking, including cyberstalking (monitoring internet/email/electronic communication), is covered under Section 78 of the Bharatiya Nyaya Sanhita (BNS), 2023."
   - Section 78 BNS covers both physical stalking AND cyber-monitoring

3. CITATION PRIORITY:
   - PRIMARY citations: The main statute directly addressing the offense
   - SECONDARY citations: Related offenses that may apply in specific contexts
   - Structure your answer with primary citations first, then mention secondary ones as "Additionally..." or "If the case involves..."
   
   Example for cyberstalking:
   - Primary: BNS 2023 Section 78 (stalking including cyber-monitoring)
   - Secondary: IT Act Section 67/67A (only if obscene content is involved)
   - Secondary: POCSO Section 11/12 (only if victim is a child)

4. REPORTING GUIDANCE:
   - For cyber-crimes: Always mention "National Cyber Crime Reporting Portal (https://cybercrime.gov.in)"
   - For workplace harassment: Mention "Internal Complaints Committee (ICC)"
   - For crimes against children: Mention "Police" with mandatory reporting

Your response format:
1. Direct answer with correct terminology
2. Primary legal citations (main statute)
3. Secondary citations (related, if applicable to context)
4. Reporting guidance (portal/authority)
5. Next steps for victim

Be clear, accurate, empathetic, and NEVER hallucinate statute names."""
