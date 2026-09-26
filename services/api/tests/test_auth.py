from app.services.auth import _bearer_token


def test_bearer_token_parses_valid_header() -> None:
    assert _bearer_token("Bearer abc.def.ghi") == "abc.def.ghi"


def test_bearer_token_rejects_wrong_scheme() -> None:
    assert _bearer_token("Basic abc") is None


def test_bearer_token_rejects_empty_header() -> None:
    assert _bearer_token(None) is None
