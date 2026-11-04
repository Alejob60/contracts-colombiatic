"""
Company profile and document domain models.

A company is the bidder entity (persona jurídica or natural with RUT)
that uploads documents, receives evaluations, and subscribes to alerts.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentType(StrEnum):
    """Supported company document categories for RAG ingestion."""

    RUP = "RUP"                     # Registro Único de Proponentes
    FINANCIAL_CERT = "FINANCIAL"    # Estados financieros / certificación
    EXPERIENCE_CERT = "EXPERIENCE"  # Certificados de experiencia
    LEGAL_REP = "LEGAL_REP"        # Certificado de existencia y representación
    OTHER = "OTHER"


class CompanyProfile(BaseModel, frozen=True):
    """
    Immutable snapshot of a company's profile as stored in the DB.

    ``nit`` is the Colombian tax ID (NIT with verification digit).
    """

    company_id: UUID
    nit: str = Field(min_length=9, max_length=12)
    razon_social: str
    representante_legal: str | None = None
    email: str | None = None
    telefono: str | None = None
    departamento: str | None = None
    ciudad: str | None = None
    unspsc_codes: tuple[str, ...] = ()
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CompanyDocument(BaseModel, frozen=True):
    """
    Metadata for a document uploaded by a company.

    The actual file lives in S3; ``s3_key`` is the object key.
    ``chunk_count`` is populated after the PDF-to-chunk pipeline runs.
    """

    document_id: UUID
    company_id: UUID
    document_type: DocumentType
    filename: str
    s3_key: str
    mime_type: str = "application/pdf"
    chunk_count: int = 0
    uploaded_at: datetime | None = None


class DocumentChunk(BaseModel, frozen=True):
    """
    A single text chunk extracted from a company document.

    ``embedding`` is omitted here — it lives in the pgvector column.
    This model carries the text + metadata used during RAG retrieval.
    """

    chunk_id: UUID
    document_id: UUID
    company_id: UUID
    page_number: int = Field(ge=0)
    chunk_index: int = Field(ge=0)
    text: str
    token_count: int = Field(ge=0)
