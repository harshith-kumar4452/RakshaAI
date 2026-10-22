"""
Show detailed view of hierarchical chunks
"""
from pathlib import Path
from src.ingest.chunker import extract_chunks

BASE_DIR = Path(__file__).resolve().parent

def show_split_sections():
    """Show sections that were split into multiple chunks"""
    file_path = BASE_DIR / "Data" / "BNS.md"
    act_name = "BNS 2023"
    
    path = Path(file_path)
    if not path.exists():
        print(f"File not found: {path}")
        return
    
    chunks = extract_chunks(str(path), act_name)
    
    # Find split sections
    parent_sections = {}
    for chunk in chunks:
        parent = chunk["metadata"].get("parent_section")
        if parent:
            if parent not in parent_sections:
                parent_sections[parent] = []
            parent_sections[parent].append(chunk)
    
    print(f"Found {len(parent_sections)} sections split into multiple chunks\n")
    
    for section_num, sub_chunks in sorted(parent_sections.items()):
        print(f"\n{'='*80}")
        print(f"Section {section_num}: {len(sub_chunks)} sub-chunks")
        print(f"{'='*80}")
        
        for i, chunk in enumerate(sub_chunks):
            metadata = chunk["metadata"]
            token_count = metadata.get("token_count", 0)
            
            print(f"\n--- Part {i+1}/{len(sub_chunks)} ({token_count} tokens) ---")
            print(f"Title: {chunk['section_title']}")
            print(f"\nFirst 300 chars:")
            print(chunk['chunk_text'][:300])
            print("...")

if __name__ == "__main__":
    show_split_sections()
