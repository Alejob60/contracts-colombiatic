"""
SECOP SODA metadata helper — Sprint 10A improvement.

Uses the Socrata metadata endpoint to detect when the government
actually updated the dataset, avoiding unnecessary syncs.

Key endpoint: GET https://www.datos.gov.co/api/views/p6dx-8zbt.json
Field: rowsUpdatedAt (Unix timestamp of last data update)

Pattern observed: government updates once daily at ~13:30 UTC (8:30 AM COT)
"""
from __future__ import annotations

import logging
import ssl
import urllib.request
import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING

logger = logging.getLogger(__name__)

_SODA_METADATA_URL = "https://www.datos.gov.co/api/views/p6dx-8zbt.json"
_CTX = None


def _ssl_ctx():
    global _CTX
    if _CTX is None:
        _CTX = ssl.create_default_context()
        _CTX.check_hostname = False
        _CTX.verify_mode = ssl.CERT_NONE
    return _CTX


def get_soda_last_updated() -> dict:
    """
    Fetch Socrata dataset metadata to get actual government update timestamp.

    Returns:
        {
          "rows_updated_at": datetime,    # when data was last changed
          "row_count": int,               # total rows in dataset
          "lag_hours": float,             # hours since last update
          "is_fresh": bool,               # True if updated in last 25h
        }
    Raises on network error.
    """
    req = urllib.request.Request(
        _SODA_METADATA_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "ColombiaTIC-Contracts/1.0",
        },
    )
    resp = urllib.request.urlopen(req, context=_ssl_ctx(), timeout=10)
    meta = json.loads(resp.read())

    rows_updated_ts = meta.get("rowsUpdatedAt")
    row_count = meta.get("rowCount", 0)

    if not rows_updated_ts:
        return {
            "rows_updated_at": None,
            "row_count": row_count,
            "lag_hours": None,
            "is_fresh": None,
        }

    dt = datetime.fromtimestamp(int(rows_updated_ts), tz=timezone.utc)
    now = datetime.now(timezone.utc)
    lag_h = (now - dt).total_seconds() / 3600

    return {
        "rows_updated_at": dt,
        "row_count": int(row_count or 0),
        "lag_hours": round(lag_h, 2),
        "is_fresh": lag_h < 25,          # fresh if updated in the last ~25 hours
        "last_updated_iso": dt.isoformat(),
        "last_updated_display": dt.strftime("%d/%m/%Y %H:%M UTC"),
    }
