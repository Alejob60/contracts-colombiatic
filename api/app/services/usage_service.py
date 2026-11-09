"""
Usage service — Sprint 14.

Monthly usage counters per user stored in Redis.
Keys expire automatically at month end (35-day TTL).

Costs that matter:
  eval  = $0.055 USD (Claude Sonnet 4.6)
  doc   = $0.30  USD (Titan Embed v2, 10-page PDF)
Everything else is negligible.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ── Plan limits ───────────────────────────────────────────────────────────
# -1 = unlimited   0 = blocked
MONTHLY_LIMITS: dict[str, dict[str, int]] = {
    "FREE":          {"evals": 0,   "docs": 0},
    "PRO_LICITADOR": {"evals": 50,  "docs": 10},
    "PRO":           {"evals": 50,  "docs": 10},
    "CORPORATIVO":   {"evals": 200, "docs": 50},
    "ENTERPRISE":    {"evals": 500, "docs": 200},
}

_PLAN_LABELS = {
    "PRO_LICITADOR": "PRO Licitador",
    "PRO":           "PRO Licitador",
    "CORPORATIVO":   "Corporativo",
    "ENTERPRISE":    "Enterprise",
    "FREE":          "Gratuito",
}

_UPGRADE_PLAN = {
    "FREE":          "PRO_LICITADOR",
    "PRO_LICITADOR": "CORPORATIVO",
    "PRO":           "CORPORATIVO",
    "CORPORATIVO":   "ENTERPRISE",
}


def _key(user_id: str, resource: str) -> str:
    now = datetime.now(timezone.utc)
    return f"contracts:usage:{user_id}:{now.year}-{now.month:02d}:{resource}"


def _ttl() -> int:
    """35-day TTL ensures keys outlive the full billing month."""
    return 35 * 24 * 3600


# ── Core functions ────────────────────────────────────────────────────────

async def get_usage(user_id: str, redis) -> dict:
    """Return current month usage for all tracked resources."""
    evals = int(await redis.get(_key(user_id, "evals")) or 0)
    docs  = int(await redis.get(_key(user_id, "docs")) or 0)
    return {"evals": evals, "docs": docs}


async def get_usage_with_limits(user_id: str, plan_tier: str, redis) -> dict:
    """Return usage + limits for the user's current plan."""
    usage = await get_usage(user_id, redis)
    limits = MONTHLY_LIMITS.get(plan_tier, MONTHLY_LIMITS["FREE"])
    return {
        "plan":       plan_tier,
        "plan_label": _PLAN_LABELS.get(plan_tier, plan_tier),
        "evals": {
            "used":  usage["evals"],
            "limit": limits["evals"],
            "pct":   _pct(usage["evals"], limits["evals"]),
        },
        "docs": {
            "used":  usage["docs"],
            "limit": limits["docs"],
            "pct":   _pct(usage["docs"], limits["docs"]),
        },
        "upgrade_to": _UPGRADE_PLAN.get(plan_tier),
    }


async def check_and_gate(
    user_id: str,
    resource: str,
    plan_tier: str,
    redis,
) -> tuple[bool, int, int]:
    """
    Check if the user is within their monthly limit.
    Returns (is_allowed, used, limit).
    """
    limits = MONTHLY_LIMITS.get(plan_tier, MONTHLY_LIMITS["FREE"])
    limit = limits.get(resource, 0)

    if limit == -1:  # unlimited
        return True, 0, -1

    if limit == 0:  # plan does not include this resource
        return False, 0, 0

    used = int(await redis.get(_key(user_id, resource)) or 0)
    return used < limit, used, limit


async def increment(user_id: str, resource: str, redis) -> int:
    """Increment the monthly counter for a resource. Returns new count."""
    key = _key(user_id, resource)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, _ttl())
    logger.debug("Usage increment: user=%s resource=%s count=%d", user_id[:8], resource, count)
    return count


def _pct(used: int, limit: int) -> int | None:
    """Return percentage 0-100, or None if unlimited."""
    if limit <= 0:
        return None
    return min(100, round(used / limit * 100))
