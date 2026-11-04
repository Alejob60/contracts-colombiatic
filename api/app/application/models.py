"""
Gated search response model for freemium / tiered access control.

Separated from the pure domain models in ``secop.py`` because gating
is an *application-layer* concern (business rule about monetization),
not a domain concept (SECOP process data).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# ── Truncation constants ─────────────────────────────────────────────────────

GATED_NAME_MAX_CHARS = 100
"""
Free-tier users see the first 100 characters of the process name.
Enough to understand the subject matter; not enough to skip the detail page.
"""


class GatedSearchResponse(BaseModel):
    """
    Search result envelope that includes freemium gating metadata.

    ``results`` contains partial process dicts — some fields are nulled
    for anonymous / FREE users to incentivize upgrade.
    """

    results: list[dict[str, object]]
    total: int
    offset: int
    limit: int
    cached: bool = False
    response_time_ms: int = 0
    remaining_free_searches: int = Field(
        default=0,
        ge=0,
        description="Searches left in the current anonymous window.",
    )
    is_gated: bool = Field(
        default=False,
        description="True when results have been truncated for the free tier.",
    )
    upgrade_url: str = "/pricing"
