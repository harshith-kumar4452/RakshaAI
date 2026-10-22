from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from src.ingest.chunker import extract_chunks
from src.ingest.embedder import ingest_chunks_to_supabase
from src.retrieval.hybrid_retriever import hybrid_retrieve
from src.settings import load_settings
from src.synthesis.legal_synthesizer import synthesize


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "Data"

DATA_FILES = [
    (DATA_DIR / "BNS.md", "BNS 2023"),
    (DATA_DIR / "POSHACT2013.md", "POSH Act 2013"),
    (DATA_DIR / "ITAct2000.md", "IT Act 2000"),
    (DATA_DIR / "POCSOAct2012.md", "POCSO Act 2012"),
    (DATA_DIR / "cybercomplaint.md", "Filing a cyber complaint"),
]

TEST_CASES = [
    {
        "complaint": "My senior colleague keeps sending me WhatsApp messages with sexual jokes after work hours and touched my shoulder without permission during a meeting.",
        "category": "sexual_harassment",
        "expected_acts": ["POSH Act 2013", "BNS 2023"],
    },
    {
        "complaint": "Someone created a fake Instagram account with my photos and is posting morphed images. They are also sending threatening messages.",
        "category": "cyberbullying",
        "expected_acts": ["IT Act 2000", "BNS 2023"],
    },
    {
        "complaint": "A 16-year-old student in my class told me a teacher has been sending her inappropriate messages on Snapchat.",
        "category": "minor_involved",
        "expected_mandatory_reporting": True,
        "expected_authority": "Police",
    },
]


def run_ingestion() -> None:
    for path, act_name in DATA_FILES:
        if not path.exists():
            logger.warning("Skipping missing file: %s", path)
            continue

        logger.info("Processing %s...", act_name)
        chunks = extract_chunks(str(path), act_name=act_name)
        logger.info("Prepared %s chunks for %s", len(chunks), act_name)
        
        # Ingest each document separately to prevent data loss
        try:
            result = ingest_chunks_to_supabase(chunks)
            logger.info("✓ Completed %s: %s", act_name, result)
        except Exception as e:
            logger.error("✗ Failed to ingest %s: %s", act_name, e)
            continue  # Continue with next document

    logger.info("Ingestion pipeline completed")


def run_test_flow() -> None:
    for i, case in enumerate(TEST_CASES, start=1):
        try:
            retrieval = hybrid_retrieve(case["complaint"], case["category"])
            synthesis = synthesize(case["complaint"], case["category"], retrieval)
        except Exception as exc:
            print(f"\n--- Test Case {i}: {case['category']} ---")
            print(f"Test failed: {exc}")
            continue

        print(f"\n--- Test Case {i}: {case['category']} ---")
        print(json.dumps(synthesis, indent=2))

        if case.get("expected_mandatory_reporting") is True:
            print("mandatory_reporting check:", synthesis.get("mandatory_reporting") is True)
            print("authority check:", synthesis.get("recommended_authority") == "Police")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Justra legal RAG pipeline")
    parser.add_argument(
        "--test",
        action="store_true",
        help="Skip ingestion and run retrieval+synthesis tests only",
    )
    return parser.parse_args()


def main() -> None:
    _ = load_settings()
    args = parse_args()

    if not args.test:
        run_ingestion()

    run_test_flow()


if __name__ == "__main__":
    main()
