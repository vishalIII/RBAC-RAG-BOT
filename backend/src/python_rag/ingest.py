import os
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4
import sys

from dotenv import load_dotenv

from langchain_community.document_loaders import (
    PyPDFLoader,
)

from langchain_community.embeddings import (
    HuggingFaceEmbeddings,
)

from langchain_qdrant import (
    FastEmbedSparse,
    QdrantVectorStore,
    RetrievalMode,
)

from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
)

from qdrant_client import QdrantClient

load_dotenv()

# =================================
# config
BASE_DIR = Path(__file__).resolve().parents[1]

DEFAULT_PDF_PATH = BASE_DIR / "data" / "pune_travel_guide_sample.pdf"

COLLECTION_NAME = os.getenv(
    "QDRANT_COLLECTION",
    "pdf-chatbot",
)

QDRANT_URL = os.getenv(
    "QDRANT_URL",
    "http://localhost:6333",
)

EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)

# =========================================================
# Helpers


def get_pdf_path() -> Path:
    configured_path = Path(
        os.getenv(
            "PDF_PATH",
            str(DEFAULT_PDF_PATH),
        )
    )

    if configured_path.is_absolute():
        return configured_path

    return BASE_DIR.parent / configured_path


def get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=QDRANT_URL)


def recreate_collection() -> None:
    client = get_qdrant_client()

    collections = client.get_collections().collections

    collection_names = [collection.name for collection in collections]

    if COLLECTION_NAME in collection_names:
        print(f"Deleting existing collection: " f"{COLLECTION_NAME}")

        client.delete_collection(collection_name=COLLECTION_NAME)


# ==================================================================================================
def calculate_confidence_score(
    content: str,
    *,
    table_present: bool = False,
    entities: list = None,
    page: int | None = None,
    language: str = "en",
    image_present: bool = False,
) -> float:
    content = content.strip()
    if not content:
        return 0.0

    score = 0.5
    words = content.split()
    word_count = len(words)

    # =====================================================================
    # WORD COUNT — image chunks get a pass
    if image_present and word_count < 15:
        score += 0.05  # don't penalize caption-only chunks
    elif word_count >= 150:
        score += 0.20
    elif word_count >= 80:
        score += 0.15
    elif word_count >= 40:
        score += 0.10
    elif word_count >= 15:
        score += 0.05
    elif word_count >= 5:
        score += 0.0
    else:
        score -= 0.20

    # ===================================================================================
    # SENTENCE QUALITY

    sentence_count = len(re.findall(r"[.!?]", content))
    if sentence_count >= 3:
        score += 0.08
    elif sentence_count >= 1:
        score += 0.03

    # =================================================================
    # UNIQUE WORD RATIO

    unique_ratio = len(set(words)) / max(word_count, 1)
    if unique_ratio > 0.45:
        score += 0.08
    elif unique_ratio < 0.20:
        score -= 0.08

    # ======================================================================
    # ENTITY RICHNESS — factual density signal

    if entities:
        entity_count = len(entities)
        if entity_count >= 5:
            score += 0.10
        elif entity_count >= 2:
            score += 0.05
        # entity density: entities per 100 words
        density = (entity_count / max(word_count, 1)) * 100
        if density > 8:
            score += 0.05  # very fact-dense chunk

    # ================================================================================
    # TABLE — use pre-computed flag, not re-check

    if table_present:
        pipe_count = content.count("|")
        if pipe_count >= 3:
            score += 0.07

    # ===================================================================
    # PAGE METADATA — None often means header/TOC

    if page is None:
        score -= 0.05

    # ==========================================================================
    # LANGUAGE

    if language != "en":
        score -= 0.10  # unexpected language in English corpus

    # =========================================================
    # OCR / CORRUPTION

    corruption_chars = ["", "\x00"]
    corruption_count = sum(content.count(c) for c in corruption_chars)
    if corruption_count > 0:
        score -= min(0.40, corruption_count * 0.08)

    # ==========================================
    # SPECIAL CHARACTER RATIO

    special_chars = sum(1 for c in content if not c.isalnum() and not c.isspace())
    special_ratio = special_chars / max(len(content), 1)
    if special_ratio > 0.45:
        score -= 0.10

    return round(max(0.0, min(score, 1.0)), 2)


# ============================================================
# Metadata Extraction


def extract_entities(content: str) -> list[str]:
    """
    Simple rule-based entity extraction.
    Replace with spaCy / LLM extraction later.
    """

    known_entities = [
        "Pune",
        "Shaniwar Wada",
        "Aga Khan Palace",
        "Sinhagad Fort",
    ]

    detected_entities = []

    content_lower = content.lower()

    for entity in known_entities:
        if entity.lower() in content_lower:
            detected_entities.append(entity)

    return detected_entities


def build_metadata(
    *,
    chunk,
    chunk_index: int,
    pdf_path: Path,
    document_id:str,
) -> dict:

    content = chunk.page_content
    page = chunk.metadata.get("page")
    table_present = content.count("|") >= 3
    image_present = False
    entities = extract_entities(content)

    confidence_score = calculate_confidence_score(
        content,
        table_present=table_present,
        entities=entities,
        page=page,
        language="en",
        image_present=image_present,
    )

    return {
        # =================================================================
        # Document Traceability
        "chunk_id": chunk_index,
        # "document_id": str(uuid4()),
        "document_id":document_id,
        "parent_id": pdf_path.stem,
        "source": pdf_path.name,
        "page": page,
        # ==========================================================================
        # DOCUMENT STRUCTURE
        "section": content[:80],
        # =====================================================================
        # DOCUMENT TYPE
        "doc_type": "travel_guide",
        # ==========================================================
        # RBAC / ACCESS CONTROL
        "department": "tourism",
        "access_level": "internal",
        "allowed_roles": [
            "tourism_admin",
            "employee",
            "manager",
        ],
        # ===================================================================
        # GOVERNANCE
        "author": "Pune Tourism Board",
        "created_at": datetime.utcnow().isoformat(),
        "language": "en",
        "tags": [
            "travel",
            "tourism",
            "pune",
        ],
        # ==============================================================
        # ENTITY EXTRACTION
        "entities": entities,
        # ==================================================================
        # QUALITY
        "confidence_score": confidence_score,
        # ======================================================================
        # MULTIMODAL FLAGS
        "table_present": table_present,
        "image_present": image_present,
    }


# ========================================
# Ingestion


def ingest_pdf() -> None:
    # pdf_path = get_pdf_path()
    pdf_path = Path(sys.argv[1])

    document_id = sys.argv[2]

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    print("\nLoading PDF...\n")

    loader = PyPDFLoader(str(pdf_path))

    documents = loader.load()

    print(f"Pages loaded: {len(documents)}")

    # ==================================================================
    # CHUNKING

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )

    chunks = splitter.split_documents(documents)

    print(f"Chunks created: {len(chunks)}")

    # ==================================================================================
    # METADATA ENRICHMENT

    print("\nAdding metadata...\n")

    for index, chunk in enumerate(chunks):

        metadata = build_metadata(
            chunk=chunk,
            chunk_index=index,
            pdf_path=pdf_path,
            document_id=document_id,
        )

        chunk.metadata.update(metadata)

    # ====================================================================================
    # EMBEDDINGS

    print("\nLoading embedding models...\n")

    dense_embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
    )

    sparse_embeddings = FastEmbedSparse(
        model_name="Qdrant/bm25",
    )

    # ===========================================================================================
    # COLLECTION RESET

    recreate_collection()

    # ==============================================================================
    # STORE IN QDRANT

    print("\nCreating embeddings and " "storing in Qdrant...\n")

    try:
        QdrantVectorStore.from_documents(
            documents=chunks,
            embedding=dense_embeddings,
            sparse_embedding=sparse_embeddings,
            retrieval_mode=RetrievalMode.HYBRID,
            url=QDRANT_URL,
            collection_name=COLLECTION_NAME,
        )

    except Exception as exc:
        raise RuntimeError("Could not store documents in Qdrant.") from exc

    print(f"\nPDF stored successfully " f"in collection: {COLLECTION_NAME}")


# ========================================================================================
# Main

if __name__ == "__main__":
    ingest_pdf()
