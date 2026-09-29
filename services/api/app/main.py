from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai, billing, documents, health, references, revision_preflight, revision_refine, similarity, sources
from app.core.config import get_settings
from app.services.observability import emit_request_log, start_request_observation

settings = get_settings()

app = FastAPI(
    title="Averis API",
    version="0.1.0",
    description="Evidence-first academic integrity analysis API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_observability(request: Request, call_next):
    request_id, started_at = start_request_observation(request)
    try:
        response = await call_next(request)
    except Exception as exc:
        emit_request_log(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=500,
            started_at=started_at,
            outcome="unhandled_error",
            error_type=type(exc).__name__,
        )
        raise

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), usb=(), payment=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"

    emit_request_log(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        started_at=started_at,
        outcome="ok" if response.status_code < 400 else "handled_error",
    )
    return response


app.include_router(health.router)
app.include_router(documents.router, prefix="/api/v1")
app.include_router(similarity.router, prefix="/api/v1")
app.include_router(sources.router, prefix="/api/v1")
app.include_router(references.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
app.include_router(revision_preflight.router, prefix="/api/v1")
app.include_router(revision_refine.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
