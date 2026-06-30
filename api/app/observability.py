from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Optional

# Context vars shared across the app
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)
family_id_ctx: ContextVar[Optional[str]] = ContextVar("family_id", default=None)


def set_request_id(request_id: Optional[str]) -> None:
    request_id_ctx.set(request_id)


def set_user_context(user_id: Optional[str], family_id: Optional[str]) -> None:
    user_id_ctx.set(user_id)
    family_id_ctx.set(family_id)


class CorrelationIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # type: ignore[override]
        record.request_id = request_id_ctx.get() or "-"
        record.user_id = user_id_ctx.get() or "-"
        record.family_id = family_id_ctx.get() or "-"
        return True


def install_logging_context_filter() -> None:
    logging.getLogger().addFilter(CorrelationIdFilter())


