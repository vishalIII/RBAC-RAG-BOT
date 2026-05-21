import os
import sys
from functools import lru_cache
from typing import List

from dotenv import load_dotenv
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_qdrant import (
    FastEmbedSparse,
    QdrantVectorStore,
    RetrievalMode,
)
from langchain_core.documents import Document
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchAny,
    MatchValue,
)

load_dotenv()

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

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "llama3",
)

OLLAMA_BASE_URL = os.getenv(
    "OLLAMA_BASE_URL",
    "http://localhost:11434",
)

NO_CONTEXT_RESPONSE = "I could not find the answer in the documents."


def _debug_print(value: object = "") -> None:
    encoding = sys.stdout.encoding or "utf-8"
    text = str(value)

    print(
        text.encode(
            encoding,
            errors="replace",
        ).decode(encoding)
    )


@lru_cache(maxsize=1)
def _vector_store() -> QdrantVectorStore:
    dense_embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
    )

    sparse_embeddings = FastEmbedSparse(
        model_name="Qdrant/bm25",
    )

    try:
        return QdrantVectorStore.from_existing_collection(
            embedding=dense_embeddings,
            sparse_embedding=sparse_embeddings,
            retrieval_mode=RetrievalMode.HYBRID,
            url=QDRANT_URL,
            collection_name=COLLECTION_NAME,
        )

    except Exception as exc:
        raise RuntimeError("Could not connect to Qdrant.") from exc


@lru_cache(maxsize=1)
def _llm() -> ChatOllama:
    return ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        num_predict=512,
    )


def build_search_filter(
    *,
    user_role: str,
    department: str | None = None,
    doc_type: str | None = None,
) -> Filter:
    """
    Build RBAC + metadata filters.
    """

    conditions = [
        FieldCondition(
            key="metadata.allowed_roles",
            match=MatchAny(any=[user_role]),
        )
    ]

    if department:
        conditions.append(
            FieldCondition(
                key="metadata.department",
                match=MatchValue(value=department),
            )
        )

    if doc_type:
        conditions.append(
            FieldCondition(
                key="metadata.doc_type",
                match=MatchValue(value=doc_type),
            )
        )

    return Filter(must=conditions)


def rerank_documents(
    documents_with_scores,
) -> List[Document]:
    """
    Simple reranking strategy.

    Replace later with:
    - Cohere Rerank
    - BGE Reranker
    - Cross encoder
    """

    filtered_docs = []

    for doc, score in documents_with_scores:

        metadata = doc.metadata

        confidence_score = metadata.get(
            "confidence_score",
            0.5,
        )

        # =================================================
        # HYBRID SEARCH SCORE
        # Lower is better
        # =================================================

        if score > 1.2:
            continue

        # =================================================
        # QUALITY FILTER
        # =================================================

        if confidence_score < 0.7:
            continue

        filtered_docs.append(doc)

    return filtered_docs


def build_context(
    documents: List[Document],
) -> str:

    context_parts = []

    for doc in documents:

        metadata = doc.metadata

        source = metadata.get(
            "source",
            "Unknown",
        )

        page = metadata.get(
            "page",
            "N/A",
        )

        section = metadata.get(
            "section",
            "Unknown",
        )

        content = doc.page_content

        formatted_chunk = f"""
SOURCE: {source}
PAGE: {page}
SECTION: {section}

CONTENT:
{content}
"""

        context_parts.append(formatted_chunk)

    return "\n\n".join(context_parts)


def clean_answer(
    answer: str,
    *,
    question: str,
    llm_question: str,
) -> str:
    lines = answer.strip().splitlines()

    repeated_questions = {
        question.strip().casefold().rstrip(":?.!"),
        llm_question.strip().casefold().rstrip(":?.!"),
    }

    while lines:
        first_line = lines[0].strip().casefold().rstrip(":?.!")

        if first_line not in repeated_questions:
            break

        lines.pop(0)

    cleaned_answer = "\n".join(lines).strip()

    return cleaned_answer or answer.strip()


def ask_question(
    question: str,
    *,
    user_role: str,
    department: str | None = None,
    doc_type: str | None = None,
) -> dict:

    question = question.strip()

    if not question:
        raise ValueError("Question is required")

    vector_store = _vector_store()

    # =====================================================
    # BUILD FILTERS
    # =====================================================

    search_filter = build_search_filter(
        user_role=user_role,
        department=department,
        doc_type=doc_type,
    )

    _debug_print("\n================ FILTERS ================\n")

    _debug_print(search_filter)

    # =====================================================
    # RETRIEVAL
    # =====================================================

    try:
        documents_with_scores = vector_store.similarity_search_with_score(
            query=question,
            k=10,
            filter=search_filter,
        )

    except Exception as exc:
        raise RuntimeError("Could not retrieve documents.") from exc

    _debug_print("\n================ RETRIEVAL DEBUG " "================\n")

    if not documents_with_scores:
        return {
            "answer": NO_CONTEXT_RESPONSE,
            "sources": [],
        }

    # =====================================================
    # DEBUG
    # =====================================================

    for index, (doc, score) in enumerate(
        documents_with_scores,
        start=1,
    ):

        _debug_print(f"\nDocument {index}")
        _debug_print(f"Score: {score}")

        _debug_print(f"Metadata: " f"{doc.metadata}")

        _debug_print(doc.page_content[:300])

    # =====================================================
    # RERANKING
    # =====================================================

    reranked_docs = rerank_documents(documents_with_scores)

    if not reranked_docs:
        return {
            "answer": NO_CONTEXT_RESPONSE,
            "sources": [],
        }

    # =====================================================
    # CONTEXT BUILDING
    # =====================================================

    context = build_context(reranked_docs)

    _debug_print("\n================ FINAL CONTEXT " "================\n")

    _debug_print(context[:3000])

    # =====================================================
    # PROMPT
    # =====================================================

    llm_question = question

    if not question.endswith(("?", ".", "!")):
        llm_question = f"What does the context say about {question}?"

    prompt = f"""
Context:

{context}

Question:

{llm_question}

Answer using only the context above.
If the answer is a list, copy only the listed items from the context.
Do not add details that are not present in the context.
Do not repeat the question in the answer.
If the answer is not in the context, reply exactly:
"{NO_CONTEXT_RESPONSE}"

Answer:
"""

    try:
        response = _llm().invoke(prompt)

    except Exception as exc:
        raise RuntimeError("Could not generate response.") from exc

    answer = clean_answer(
        response.content,
        question=question,
        llm_question=llm_question,
    )

    # =====================================================
    # CITATIONS
    # =====================================================

    citations = []

    for doc in reranked_docs:

        metadata = doc.metadata

        citations.append(
            {
                "source": metadata.get("source"),
                "page": metadata.get("page"),
                "section": metadata.get("section"),
            }
        )

    return {
        "answer": answer,
        "sources": citations,
    }
