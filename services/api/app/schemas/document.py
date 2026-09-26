from pydantic import BaseModel


class ExtractedDocument(BaseModel):
    filename: str
    media_type: str | None
    characters: int
    words: int
    text: str
