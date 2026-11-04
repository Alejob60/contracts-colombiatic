"""
Bid-evaluation domain models.

An *evaluation* is the AI-generated analysis that compares a company's
profile/documents against the requirements of a specific SECOP process.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────

class EvalStatus(StrEnum):
    """Lifecycle states of an evaluation."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Feasibility(StrEnum):
    """High-level feasibility verdict for a bid."""

    VIABLE = "VIABLE"               # company likely meets all requirements
    PARTIAL = "PARTIAL"             # meets some but not all
    NOT_VIABLE = "NOT_VIABLE"       # critical gaps exist
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class RiskSeverity(StrEnum):
    """Risk severity classification."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ── Value objects ─────────────────────────────────────────────────────────

class RiskItem(BaseModel, frozen=True):
    """A single identified risk that could affect bid success."""

    category: str
    description: str
    severity: RiskSeverity
    mitigation: str | None = None


class QualificationItem(BaseModel, frozen=True):
    """
    Assessment of a single qualification requirement.

    ``score`` is 0.0–1.0 where 1.0 means the requirement is fully met.
    """

    requirement: str
    met: bool
    score: float = Field(ge=0.0, le=1.0)
    evidence: str | None = None
    gap: str | None = None


# ── Aggregate ─────────────────────────────────────────────────────────────

class EvaluationAnalysis(BaseModel, frozen=True):
    """
    The AI-generated analysis payload embedded inside a ``BidEvaluation``.

    Separated so the raw Bedrock response can be validated independently
    before being persisted.
    """

    feasibility: Feasibility
    overall_score: float = Field(ge=0.0, le=1.0)
    summary: str
    qualifications: tuple[QualificationItem, ...] = ()
    risks: tuple[RiskItem, ...] = ()
    recommendations: tuple[str, ...] = ()


class BidEvaluation(BaseModel, frozen=True):
    """
    Top-level evaluation entity tying a company to a SECOP process.

    ``proceso_id`` is the SECOP ``id_del_proceso``, not an internal UUID.
    """

    evaluation_id: UUID
    company_id: UUID
    proceso_id: str
    status: EvalStatus = EvalStatus.PENDING
    analysis: EvaluationAnalysis | None = None
    requested_at: datetime | None = None
    completed_at: datetime | None = None
    model_id: str | None = None
    error_message: str | None = None
