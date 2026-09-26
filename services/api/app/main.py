from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai, documents, health, references, reports, similarity, sources
from app.core.config import get_settings

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
)

app.include_router(health.router)
app.include_router(documents.router, prefix="/api/v1")
app.include_router(similarity.router, prefix="/api/v1")
app.include_router(sources.router, prefix="/api/v1")
app.include_router(references.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")
