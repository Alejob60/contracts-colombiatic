"""
Claude Haiku structured output via AWS Bedrock Converse API.

WHY Converse API instead of InvokeModel: Converse provides a unified
interface across model providers, handles message formatting internally,
and returns structured output metadata. InvokeModel would require
model-specific request/response marshalling.

WHY JSON extraction from markdown fences: Claude reliably formats JSON
responses, but occasionally wraps them in ```json blocks even when
instructed not to. The extraction handles both cases defensively.
"""
from __future__ import annotations

import json
import logging
from typing import Type

import boto3
from pydantic import BaseModel, ValidationError

from app.config import Settings

logger = logging.getLogger(__name__)

# Claude Haiku temperature for deterministic structured output
_EVAL_TEMPERATURE = 0.1

# Conservative max — evaluation responses are typically 1-2k tokens
_DEFAULT_MAX_TOKENS = 4096


class LlmParseError(Exception):
    """Raised when the LLM response cannot be parsed into the expected schema."""

    def __init__(self, raw_text: str, cause: Exception) -> None:
        self.raw_text = raw_text
        self.cause = cause
        super().__init__(f"Failed to parse LLM output: {cause}")


class BedrockLlmService:
    """
    Thin adapter over Bedrock Converse for structured (Pydantic) output.

    Stateless except for the boto3 client — safe to instantiate per-request
    or share across concurrent calls (boto3 clients are thread-safe).
    """

    def __init__(self, settings: Settings) -> None:
        self._client = boto3.client(
            "bedrock-runtime",
            region_name=settings.AWS_REGION,
        )
        self._model = settings.BEDROCK_MODEL_EVALUATOR

    def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        output_schema: Type[BaseModel],
        max_tokens: int = _DEFAULT_MAX_TOKENS,
    ) -> BaseModel:
        """
        Call Claude Haiku via Converse and parse the response as *output_schema*.

        Raises ``LlmParseError`` if the response is not valid JSON or does not
        conform to the schema. The raw text is attached for debugging.
        """
        response = self._client.converse(
            modelId=self._model,
            system=[{"text": system_prompt}],
            messages=[{
                "role": "user",
                "content": [{"text": user_prompt}],
            }],
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": _EVAL_TEMPERATURE,
            },
        )

        raw_text: str = response["output"]["message"]["content"][0]["text"]
        cleaned = _extract_json_block(raw_text)

        try:
            return output_schema.model_validate_json(cleaned)
        except (ValidationError, json.JSONDecodeError) as exc:
            logger.error(
                "LLM output parse failed",
                extra={
                    "model": self._model,
                    "schema": output_schema.__name__,
                    "raw_text_preview": raw_text[:500],
                    "error": str(exc),
                },
            )
            raise LlmParseError(raw_text, exc) from exc


def _extract_json_block(text: str) -> str:
    """
    Strip markdown code fences if present, returning the inner JSON string.

    Handles both ``\\`\\`\\`json ... \\`\\`\\``` and bare ``\\`\\`\\` ... \\`\\`\\``` fences.
    If no fences are found, returns the original text (assumes bare JSON).
    """
    if "```json" in text:
        return text.split("```json", 1)[1].split("```", 1)[0].strip()
    if "```" in text:
        return text.split("```", 1)[1].split("```", 1)[0].strip()
    return text.strip()
