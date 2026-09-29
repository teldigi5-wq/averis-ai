from __future__ import annotations

from app.api.routes.billing import _normalize_creem_payload


def test_normalizes_creem_cancelled_event_spelling() -> None:
    payload = {
        "id": "evt_cancelled",
        "eventType": "subscription.cancelled",
        "object": {
            "id": "sub_test",
            "status": "cancelled",
        },
    }

    normalized = _normalize_creem_payload(payload)

    assert normalized["eventType"] == "subscription.canceled"
    assert normalized["object"]["status"] == "canceled"
    assert payload["eventType"] == "subscription.cancelled"
    assert payload["object"]["status"] == "cancelled"


def test_normalizes_nested_subscription_status_for_refunds() -> None:
    payload = {
        "id": "evt_refund",
        "eventType": "refund.created",
        "object": {
            "subscription": {
                "id": "sub_test",
                "status": "cancelled",
            }
        },
    }

    normalized = _normalize_creem_payload(payload)

    assert normalized["eventType"] == "refund.created"
    assert normalized["object"]["subscription"]["status"] == "canceled"


def test_other_creem_events_pass_through_unchanged() -> None:
    payload = {
        "id": "evt_paid",
        "eventType": "subscription.paid",
        "object": {"id": "sub_test", "status": "active"},
    }

    assert _normalize_creem_payload(payload) == payload
