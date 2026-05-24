# syntax=docker/dockerfile:1

FROM python:3.12-slim AS deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY apps/ai/pyproject.toml apps/ai/uv.lock ./
RUN uv sync --frozen --no-install-project

FROM python:3.12-slim AS dev
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
COPY --from=deps /app/.venv ./.venv
COPY apps/ai/ .
EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM python:3.12-slim AS prod
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
COPY --from=deps /app/.venv ./.venv
COPY apps/ai/ .
EXPOSE 8000
USER nobody
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
