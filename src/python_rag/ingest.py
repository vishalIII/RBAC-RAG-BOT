import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_qdrant import (
    FastEmbedSparse,
    QdrantVectorStore,
    RetrievalMode,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[1]

DEFAULT_PDF_PATH = (
    BASE_DIR / "data" / "pune_travel_guide_sample.pdf"
)

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


def _pdf_path() -> Path:
    configured_path = Path(
        os.getenv(
            "PDF_PATH",
            str(DEFAULT_PDF_PATH),
        )
    )

    if configured_path.is_absolute():
        return configured_path

    return BASE_DIR.parent / configured_path


def _delete_existing_collection() -> None:
    client = QdrantClient(url=QDRANT_URL)

    collections = client.get_collections().collections
    collection_names = [c.name for c in collections]

    if COLLECTION_NAME in collection_names:
        print(f"Deleting old collection: {COLLECTION_NAME}")
        client.delete_collection(COLLECTION_NAME)


def ingest_pdf() -> None:
    pdf_path = _pdf_path()

    if not pdf_path.exists():
        raise FileNotFoundError(
            f"PDF not found: {pdf_path}"
        )

    print("\nLoading PDF...\n")

    loader = PyPDFLoader(str(pdf_path))

    documents = loader.load()

    print(f"Pages loaded: {len(documents)}")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )

    chunks = splitter.split_documents(documents)

    print(f"Chunks created: {len(chunks)}")

    dense_embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
    )

    sparse_embeddings = FastEmbedSparse(
        model_name="Qdrant/bm25",
    )

    _delete_existing_collection()

    print("\nCreating embeddings and storing in Qdrant...\n")

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
        raise RuntimeError(
            "Could not store documents in Qdrant."
        ) from exc

    print(
        f"\nPDF stored successfully in collection: "
        f"{COLLECTION_NAME}"
    )


if __name__ == "__main__":
    ingest_pdf()