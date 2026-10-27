"""Networked TLS regression against public eMudhra compromised-chain test endpoints.

Run only in disposable CI (no credentials), not at application startup.
A DNS, proxy, connection or timeout error is NOT a security pass.
"""

from __future__ import annotations

import socket
import ssl
import sys

import httpx

TIMEOUT = 12.0
CONTROL_HOST = "www.python.org"
COMPROMISED_HOSTS = (
    "dv-g3b-emudhra.we-have-a-problem.com",
    "dv-g3b-aaa-emudhra.we-have-a-problem.com",
)


def tls_connect(host: str, context: ssl.SSLContext) -> None:
    with socket.create_connection((host, 443), timeout=TIMEOUT) as tcp:
        with context.wrap_socket(tcp, server_hostname=host) as stream:
            stream.settimeout(TIMEOUT)


def verified_ssl_failure(error: BaseException) -> bool:
    seen: set[int] = set()
    pending: list[BaseException] = [error]
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, ssl.SSLCertVerificationError):
            return True
        for nested in (current.__cause__, current.__context__):
            if isinstance(nested, BaseException):
                pending.append(nested)
    return False


def run_probe() -> None:
    if not ((3, 12, 16) <= sys.version_info[:3] < (3, 13, 0)):
        raise AssertionError(f"Python TLS patch floor not met: {sys.version}")
    tls_connect(CONTROL_HOST, ssl.create_default_context())
    print(f"PASS standard-library positive TLS control: {CONTROL_HOST}", flush=True)

    with httpx.Client(timeout=TIMEOUT, trust_env=False, follow_redirects=False) as client:
        # Any HTTP status is acceptable: only successful certificate verification matters.
        client.head(f"https://{CONTROL_HOST}/")
        print(f"PASS httpx positive TLS control: {CONTROL_HOST}", flush=True)

        for host in COMPROMISED_HOSTS:
            # Establish the endpoint is genuinely reachable, without sending HTTP data
            # or allowing insecure verification in any application request.
            unverified = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            unverified.check_hostname = False
            unverified.verify_mode = ssl.CERT_NONE
            tls_connect(host, unverified)

            try:
                tls_connect(host, ssl.create_default_context())
            except ssl.SSLCertVerificationError as exc:
                print(f"PASS stdlib rejected compromised chain: {host} ({exc.verify_message})", flush=True)
            else:
                raise AssertionError(f"VULNERABLE: stdlib accepted compromised chain: {host}")

            try:
                client.head(f"https://{host}/")
            except httpx.ConnectError as exc:
                if not verified_ssl_failure(exc):
                    raise AssertionError(f"INCONCLUSIVE: non-TLS httpx connection failure for {host}") from exc
                print(f"PASS httpx rejected compromised chain: {host}", flush=True)
            else:
                raise AssertionError(f"VULNERABLE: httpx accepted compromised chain: {host}")


if __name__ == "__main__":
    run_probe()
