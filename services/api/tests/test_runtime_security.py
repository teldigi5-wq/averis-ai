"""Security floor regression: reject known-bad patch versions without a network."""
import pytest

from app.core.runtime_security import require_patched_python_tls


@pytest.mark.parametrize("version", [
    (3, 11, 18), (3, 12, 16), (3, 12, 17),
    (3, 13, 18), (3, 14, 10), (3, 15, 2),
])
def test_patched_python_tls_passes(version):
    require_patched_python_tls(version)


@pytest.mark.parametrize("version", [
    (3, 10, 99), (3, 11, 17), (3, 12, 15),
    (3, 13, 17), (3, 14, 9), (3, 15, 1),
    (3, 16, 0),
])
def test_unpatched_or_unreviewed_python_fails_closed(version):
    with pytest.raises(RuntimeError, match="CVE-2026-115557"):
        require_patched_python_tls(version)


def test_current_interpreter_is_patched():
    require_patched_python_tls()
