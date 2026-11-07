"""
AWS Bedrock Titan Embed Text v2 adapter.

Produces 1024-dimensional normalized embeddings for RAG retrieval.
The model is invoked synchronously — callers that need batching should
call ``embed_batch`` which loops but handles errors per-item.
"""
from __future__ import annotations

import json
import logging

import boto3

from app.config import Settings

logger = logging.getLogger(__name__)

_MAX_CHARS = 8_000  # Titan v2 context limit (conservative)


class BedrockEmbeddingService:
    def __init__(self, settings: Settings) -> None:
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=settings.AWS_REGION,
        )
        self._model = settings.BEDROCK_MODEL_EMBED  # amazon.titan-embed-text-v2:0

    def embed(self, text: str) -> list[float]:
        """Return a 1024-dim embedding for *text*. Truncates silently."""
        body = json.dumps({
            "inputText": text[:_MAX_CHARS],
            "dimensions": 1024,
            "normalize": True,
        })
        try:
            response = self._client.invoke_model(
                modelId=self._model,
                body=body,
                contentType="application/json",
                accept="application/json",
            )
            return json.loads(response["body"].read())["embedding"]
        except Exception as exc:
            logger.error("Bedrock embed failed: %s", exc)
            raise

    def embed_batch(self, texts: list[str]) -> list[list[float] | None]:
        """
        Embed a list of texts.  Returns ``None`` for items that fail
        so the caller can decide whether to skip or abort.
        """
        results: list[list[float] | None] = []
        for t in texts:
            try:
                results.append(self.embed(t))
            except Exception as exc:
                logger.warning("Batch embed item failed: %s", exc)
                results.append(None)
        return results
