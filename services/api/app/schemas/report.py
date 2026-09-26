from pydantic import BaseModel, Field


class IntegrityReportRequest(BaseModel):
    document_text: str = Field(min_length=1, max_length=500_000)
    source_text: str = Field(min_length=1, max_length=500_000)
    source_name: str = Field(default="reference", min_length=1, max_length=250)
    document_name: str = Field(default="submission", min_length=1, max_length=250)
    exclude_quotes: bool = False
    exclude_bibliography: bool = False
    min_match_words: int = Field(default=3, ge=3, le=50)
