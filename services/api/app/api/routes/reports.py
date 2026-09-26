from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Response

from app.schemas.report import IntegrityReportRequest
from app.services.auth import AuthContext, require_user
from app.services.rate_limit import REPORT_EXPORT, enforce_rate_limit
from app.services.report_pdf import build_integrity_report_pdf
from app.services.similarity import compare_texts

router = APIRouter(prefix="/reports", tags=["reports"])


_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def _download_name(document_name: str) -> str:
    stem = document_name.rsplit(".", 1)[0]
    safe = _SAFE_FILENAME.sub("-", stem).strip("-._")[:80] or "submission"
    return f"{safe}-averis-integrity-report.pdf"


@router.post("/integrity.pdf")
async def integrity_report_pdf(
    payload: IntegrityReportRequest,
    auth: AuthContext = Depends(require_user),
) -> Response:
    await enforce_rate_limit(auth, REPORT_EXPORT)

    report = compare_texts(
        document_text=payload.document_text,
        source_text=payload.source_text,
        source_name=payload.source_name,
        exclude_quotes=payload.exclude_quotes,
        exclude_bibliography=payload.exclude_bibliography,
        min_match_words=payload.min_match_words,
    )
    pdf = build_integrity_report_pdf(document_name=payload.document_name, report=report)

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{_download_name(payload.document_name)}"',
            "Cache-Control": "no-store",
            "X-Averis-Evidence-Version": report.evidence_version,
        },
    )
