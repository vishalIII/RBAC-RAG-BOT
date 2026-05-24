import os
import sys
import cohere
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

COHERE_API_KEY = os.getenv("COHERE_API_KEY")
if not COHERE_API_KEY:
    raise ValueError("COHERE_API_KEY is missing.")

NO_CONTEXT_RESPONSE = "I could not find the answer in the documents."


co = cohere.Client(api_key=COHERE_API_KEY)


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
    query: str,
    documents_with_scores,
    *,
    top_k: int = 7,
) -> List[Document]:
    """
    Industry-standard two-stage reranking.
    
    Pre-filter  → remove only corrupt/empty garbage (very low bar)
    Cohere      → semantic relevance (does the heavy lifting)
    Post-filter → trust Cohere score only, confidence is a blend signal only
    """

    # =====================================================
    # PRE FILTERING — garbage removal only
    # Confidence score is NOT a relevance signal here.
    # Only remove truly broken chunks.
    # =====================================================
    CORRUPTION_CONFIDENCE_MAX = 0.20   # only reject actual garbage
    VECTOR_SCORE_MAX = 2.0             # wide net — let Cohere decide

    filtered_docs = []
    rejected_docs = []

    for doc, score in documents_with_scores:
        metadata = doc.metadata
        confidence_score = metadata.get("confidence_score", 0.5)

        # Reject corrupted/empty chunks only
        if confidence_score < CORRUPTION_CONFIDENCE_MAX:
            rejected_docs.append((doc, score, "corruption"))
            continue

        # Reject astronomically bad vector matches only
        if score > VECTOR_SCORE_MAX:
            rejected_docs.append((doc, score, "vector_score"))
            continue

        filtered_docs.append(doc)

    # =====================================================
    # FALLBACK — if everything got filtered, return best
    # vector matches so user never gets empty response
    # =====================================================
    if not filtered_docs:
        _debug_print("WARNING: All docs filtered — falling back to top vector matches")
        filtered_docs = [
            doc for doc, score in sorted(
                documents_with_scores,
                key=lambda x: x[1],
            )[:top_k]
        ]

    # =====================================================
    # PREPARE DOCUMENTS FOR COHERE
    # Include entities in context — helps Cohere score better
    # =====================================================
    cohere_docs = []
    for doc in filtered_docs:
        metadata = doc.metadata
        source = metadata.get("source", "Unknown")
        section = metadata.get("section", "Unknown")
        entities = metadata.get("entities", [])

        entity_hint = ""
        if entities:
            entity_hint = f"ENTITIES: {', '.join(entities)}\n"

        cohere_docs.append(
            f"SOURCE: {source}\n"
            f"SECTION: {section}\n"
            f"{entity_hint}"
            f"\nCONTENT:\n{doc.page_content}"
        )

    # =====================================================
    # COHERE RERANK — the actual relevance engine
    # =====================================================
    try:
        response = co.rerank(
            model="rerank-v3.5",
            query=query,
            documents=cohere_docs,
            top_n=min(top_k, len(cohere_docs)),
        )
    except Exception as exc:
        raise RuntimeError(f"Cohere reranking failed: {exc}") from exc

    # =====================================================
    # POST-RERANK — trust Cohere, use confidence as blend
    # Do NOT gate hard on confidence here.
    # =====================================================
    RERANK_SCORE_MIN = 0.05   # very low — only reject totally irrelevant

    reranked_docs = []
    for result in response.results:

        # Only reject completely irrelevant results
        if result.relevance_score < RERANK_SCORE_MIN:
            continue

        doc = filtered_docs[result.index]
        confidence = doc.metadata.get("confidence_score", 0.5)

        # Confidence is a blend signal only — not a gate
        # 85% Cohere (semantic) + 15% confidence (chunk quality)
        combined = (0.85 * result.relevance_score) + (0.15 * confidence)

        doc.metadata["rerank_score"] = round(result.relevance_score, 3)
        doc.metadata["combined_score"] = round(combined, 3)
        reranked_docs.append(doc)

    # =====================================================
    # FINAL FALLBACK — if Cohere returns nothing useful
    # Never return empty — return best vector matches
    # =====================================================
    if not reranked_docs:
        _debug_print("WARNING: No docs passed rerank — falling back to filtered_docs")
        for doc in filtered_docs[:top_k]:
            doc.metadata["rerank_score"] = 0.0
            doc.metadata["combined_score"] = doc.metadata.get("confidence_score", 0.5)
            reranked_docs.append(doc)

    # =====================================================
    # DEBUG
    # =====================================================
    _debug_print("\n================ RERANK DEBUG ================\n")
    _debug_print(f"Vector search returned : {len(list(documents_with_scores))} docs")
    _debug_print(f"After pre-filter       : {len(filtered_docs)} docs")
    _debug_print(f"After Cohere           : {len(reranked_docs)} docs")
    _debug_print(f"Rejected               : {len(rejected_docs)} docs")

    for index, doc in enumerate(reranked_docs, start=1):
        metadata = doc.metadata
        _debug_print(
            f"Rank {index} | "
            f"Rerank: {metadata.get('rerank_score', 0):.3f} | "
            f"Confidence: {metadata.get('confidence_score', 0):.2f} | "
            f"Combined: {metadata.get('combined_score', 0):.3f} | "
            f"Words: {len(doc.page_content.split())} | "
            f"Entities: {len(metadata.get('entities', []))} | "
            f"Table: {metadata.get('table_present', False)} | "
            f"Page: {metadata.get('page', 'N/A')}"
        )
        _debug_print(doc.page_content[:300])

    return reranked_docs


def deduplicate_documents(
    documents: List[Document],
) -> List[Document]:

    seen = set()

    unique_docs = []

    for doc in documents:

        content = doc.page_content.strip()

        if content in seen:
            continue

        seen.add(content)

        unique_docs.append(doc)

    return unique_docs


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
SECTION:{section}
SOURCE: {source}
PAGE: {page}

CONTENT:
{content}
"""

        context_parts.append(formatted_chunk)

    return "\n\n".join(context_parts)

async def ask_question_stream(
    question: str,
    *,
    user_role: str,
    department: str | None = None,
    doc_type: str | None = None,
):

    question = question.strip()

    if not question:
        raise ValueError("Question is required")

    vector_store = _vector_store()

    # =========================================
    # FILTERS

    search_filter = build_search_filter(
        user_role=user_role,
        department=department,
        doc_type=doc_type,
    )

    # =========================================
    # RETRIEVAL

    documents_with_scores = (
        vector_store.similarity_search_with_score(
            query=question,
            k=15,
            filter=search_filter,
        )
    )

    if not documents_with_scores:

        async def no_context():
            yield f"data: {NO_CONTEXT_RESPONSE}\n\n"

        return no_context()

    # =========================================
    # RERANKING

    reranked_docs = rerank_documents(
        question,
        documents_with_scores,
        top_k=7,
    )

    reranked_docs = deduplicate_documents(
        reranked_docs
    )

    if not reranked_docs:

        async def no_context():
            yield f"data: {NO_CONTEXT_RESPONSE}\n\n"

        return no_context()

    # =========================================
    # CONTEXT

    context = build_context(reranked_docs)

    # =========================================
    # PROMPT

    prompt = f"""
Context:

{context}

Question:

{question}

Answer using only the context above.
"""

    # =========================================
    # STREAMING GENERATOR

    async def token_generator():

        full_answer = ""

        try:

            async for chunk in _llm().astream(prompt):

                token = chunk.content

                full_answer += token

                yield f"data: {token}\n\n"

        except Exception:

            yield "data: Error generating response.\n\n"

    return token_generator()