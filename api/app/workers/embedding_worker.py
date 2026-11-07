"""
Background indexing worker: PDF → text → chunks → embeddings → pgvector.

Called as a FastAPI ``BackgroundTasks`` task so it runs after the HTTP
response is already sent to the client.  Never raises — errors are
captured in ``company_documents.error_message``.
"""
from __future__ import annotations

import asyncio
import io
import logging
from typing import TYPE_CHECKING

import asyncpg
import pdfplumber

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

_MAX_WORDS    = 500   # words per chunk
_OVERLAP      = 50    # word overlap between consecutive chunks


# ── Text extraction ───────────────────────────────────────────────────────

def _extract_pages(file_bytes: bytes) -> list[dict]:
    """Return [{text, page_num}] from PDF bytes."""
    pages: list[dict] = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append({"text": text, "page_num": i})
    except Exception as exc:
        logger.error("pdfplumber extraction failed: %s", exc)
    return pages


# ── Chunking ──────────────────────────────────────────────────────────────

def _chunk_pages(pages: list[dict]) -> list[dict]:
    """Split pages into overlapping word-window chunks."""
    # Flatten words with their source page
    word_pages: list[tuple[str, int]] = []
    for p in pages:
        for w in p["text"].split():
            word_pages.append((w, p["page_num"]))

    chunks: list[dict] = []
    i = 0
    idx = 0
    while i < len(word_pages):
        window = word_pages[i : i + _MAX_WORDS]
        text   = " ".join(w for w, _ in window)
        if text.strip():
            chunks.append({
                "chunk_index": idx,
                "text":        text,
                "page_num":    window[0][1] if window else 1,
                "token_count": len(window),
            })
            idx += 1
        i += _MAX_WORDS - _OVERLAP
    return chunks


# ── DB helpers ─────────────────────────────────────────────────────────────

def _pg_url(settings: "Settings") -> str:
    return (
        settings.DATABASE_URL
        .replace("postgresql+asyncpg://", "postgresql://")
        .split("?")[0]
    )


async def _set_status(conn: asyncpg.Connection, doc_id: str, status: str, error: str | None = None) -> None:
    await conn.execute(
        """UPDATE contracts.company_documents
           SET status=$1, error_message=$2, updated_at=now()
           WHERE id=$3""",
        status, error, doc_id,
    )


# ── Main worker ───────────────────────────────────────────────────────────

async def index_document(
    doc_id: str,
    company_id: str,
    file_bytes: bytes,
    settings: "Settings",
) -> None:
    """
    Full indexing pipeline for one document.

    Steps:
    1. Extract text pages with pdfplumber
    2. Split into _MAX_WORDS-word chunks with _OVERLAP overlap
    3. Embed each chunk via Bedrock Titan v2 (1024 dims)
    4. Upsert into contracts.document_chunks (pgvector)
    5. Update company_documents.status = INDEXED / FAILED
    """
    from app.infrastructure.bedrock_embedding import BedrockEmbeddingService

    embedder = BedrockEmbeddingService(settings)
    conn = await asyncpg.connect(
        _pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )

    try:
        await _set_status(conn, doc_id, "CHUNKING")

        pages = _extract_pages(file_bytes)
        if not pages:
            await _set_status(conn, doc_id, "FAILED", "No se pudo extraer texto del PDF")
            return

        chunks = _chunk_pages(pages)
        if not chunks:
            await _set_status(conn, doc_id, "FAILED", "No se generaron fragmentos")
            return

        logger.info("Doc %s: %d pages → %d chunks", doc_id, len(pages), len(chunks))
        await _set_status(conn, doc_id, "EMBEDDING")

        stored = 0
        for chunk in chunks:
            try:
                embedding = embedder.embed(chunk["text"])
                # pgvector accepts a Python list as a string representation
                await conn.execute(
                    """INSERT INTO contracts.document_chunks
                         (doc_id, company_id, chunk_index, chunk_text, embedding, page_num, token_count)
                       VALUES ($1, $2, $3, $4, $5::vector, $6, $7)
                       ON CONFLICT (doc_id, chunk_index) DO UPDATE SET
                         chunk_text = EXCLUDED.chunk_text,
                         embedding  = EXCLUDED.embedding,
                         page_num   = EXCLUDED.page_num,
                         token_count= EXCLUDED.token_count""",
                    doc_id, company_id,
                    chunk["chunk_index"], chunk["text"],
                    str(embedding),          # '[0.1, 0.2, ...]' — pgvector parses this
                    chunk["page_num"], chunk["token_count"],
                )
                stored += 1
            except Exception as exc:
                logger.warning("Chunk %d embed/store failed: %s", chunk["chunk_index"], exc)

        await conn.execute(
            """UPDATE contracts.company_documents
               SET status='INDEXED', chunk_count=$1, error_message=NULL, updated_at=now()
               WHERE id=$2""",
            stored, doc_id,
        )
        logger.info("Doc %s indexed: %d/%d chunks stored", doc_id, stored, len(chunks))

    except Exception as exc:
        logger.error("index_document failed for %s: %s", doc_id, exc)
        try:
            await _set_status(conn, doc_id, "FAILED", str(exc)[:500])
        except Exception:
            pass
    finally:
        await conn.close()
