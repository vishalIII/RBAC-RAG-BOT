import os
from functools import lru_cache

from dotenv import load_dotenv
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_qdrant import (
    FastEmbedSparse,
    QdrantVectorStore,
    RetrievalMode,
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

NO_CONTEXT_RESPONSE = (
    "I could not find the answer in the documents."
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
        vector_store = QdrantVectorStore.from_existing_collection(
            embedding=dense_embeddings,
            sparse_embedding=sparse_embeddings,
            retrieval_mode=RetrievalMode.HYBRID,
            url=QDRANT_URL,
            collection_name=COLLECTION_NAME,
        )

        return vector_store

    except Exception as exc:
        raise RuntimeError(
            "Could not connect to Qdrant."
        ) from exc


@lru_cache(maxsize=1)
def _llm() -> ChatOllama:
    return ChatOllama(
        model=OLLAMA_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        num_predict=512,
    )


def ask_question(question: str) -> str:
    question = question.strip()

    if not question:
        raise ValueError("Question is required")

    vector_store = _vector_store()

    try:
        documents_with_scores = (
            vector_store.similarity_search_with_score(
                query=question,
                k=5,
            )
        )

    except Exception as exc:
        raise RuntimeError(
            "Could not retrieve documents."
        ) from exc

    print("\n================ RETRIEVAL DEBUG ================\n")

    if not documents_with_scores:
        print("No documents retrieved.")
        return NO_CONTEXT_RESPONSE

    filtered_docs = []

    for index, (doc, score) in enumerate(
        documents_with_scores,
        start=1,
    ):
        print(f"\nDocument {index}")
        print(f"Score: {score}")
        print(doc.page_content[:500])

        # Hybrid search scores:
        # Lower score = better match
        if score < 1.2:
            filtered_docs.append(doc)

    if not filtered_docs:
        print("\nNo relevant documents after filtering.")
        return NO_CONTEXT_RESPONSE

    context = "\n\n".join(
        doc.page_content
        for doc in filtered_docs
    )

    print("\n================ CONTEXT ================\n")
    print(context[:3000])

    prompt = f"""
You are a helpful AI assistant.

Use ONLY the provided context
to answer the question.

If the answer is not found
in the context, reply exactly:

"{NO_CONTEXT_RESPONSE}"

================ CONTEXT ================

{context}

================ QUESTION ================

{question}

================ ANSWER ================
"""

    try:
        response = _llm().invoke(prompt)

    except Exception as exc:
        raise RuntimeError(
            "Could not generate response."
        ) from exc

    print("\n================ FINAL ANSWER ================\n")
    print(response.content)

    return response.content