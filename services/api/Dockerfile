# CPython 3.12.16 includes the ssl certificate denylist for CVE-2026-115557.
# Keep to the official patch-specific tag; verify the interpreter before pip performs HTTPS.
# Resolve and pin a reviewed multi-arch OCI digest before production promotion.
FROM python:3.12.16-slim

RUN python -c 'import ssl, sys; assert (3, 12, 16) <= sys.version_info[:3] < (3, 13, 0), f"unpatched Python runtime: {sys.version}"; print(f"Python TLS security floor OK: {sys.version.split()[0]} ({ssl.OPENSSL_VERSION})")'

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
