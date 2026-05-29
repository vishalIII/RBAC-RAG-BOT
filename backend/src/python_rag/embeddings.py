from __future__ import annotations

from typing import Any

from huggingface_hub import InferenceClient
from langchain_core.embeddings import Embeddings


class HuggingFaceHubEmbeddings(Embeddings):
    """
    LangChain embeddings adapter for Hugging Face feature extraction.
    """

    def __init__(self, *, token: str, model: str) -> None:
        self._client = InferenceClient(token=token)
        self._model = model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]

    def _embed(self, texts: list[str]) -> list[list[float]]:
        response = self._client.feature_extraction(
            texts,
            model=self._model,
        )

        return _as_vectors(response)


def _as_vectors(value: Any) -> list[list[float]]:
    if hasattr(value, "tolist"):
        value = value.tolist()

    if not value:
        return []

    if isinstance(value[0], (float, int)):
        return [[float(item) for item in value]]

    return [
        [float(item) for item in vector]
        for vector in value
    ]