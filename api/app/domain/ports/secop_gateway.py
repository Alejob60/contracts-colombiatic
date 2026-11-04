"""
Port (interface) for the SECOP II data gateway.

Hexagonal architecture: the domain defines what it needs via an ABC;
the infrastructure layer provides a concrete adapter (Socrata HTTP, mock, etc.).
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain.models.secop import SecopFilter, SecopProcess, SecopSearchResult


class ISecopGateway(ABC):
    """
    Abstract gateway for querying SECOP II procurement data.

    Implementations must handle caching, rate-limiting, and error
    translation so the application layer receives clean domain objects.
    """

    @abstractmethod
    async def search(self, filters: SecopFilter) -> SecopSearchResult:
        """
        Search SECOP II processes matching the given filters.

        Args:
            filters: Immutable filter criteria (keyword, entity, dates, etc.).

        Returns:
            A ``SecopSearchResult`` with paginated process summaries.

        Raises:
            SecopGatewayError: when the upstream API is unreachable or
                returns an unexpected response.
        """

    @abstractmethod
    async def get_process(self, proceso_id: str) -> SecopProcess | None:
        """
        Fetch full detail for a single SECOP II process.

        Args:
            proceso_id: The unique ``id_del_proceso`` from SECOP.

        Returns:
            The ``SecopProcess`` if found, or ``None`` if the process
            does not exist in the SECOP dataset.

        Raises:
            SecopGatewayError: on upstream communication failure.
        """
