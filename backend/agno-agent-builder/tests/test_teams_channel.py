"""Tests for the Teams channel loader: parsing, bind extraction, and the
JWT verification cache. End-to-end JWT validation is exercised with a
locally generated RSA key whose JWK we inject into the module cache;
this avoids any network call to login.botframework.com.
"""

from __future__ import annotations

import json
import time
from typing import Any

import jwt
import pytest
from agno_agent_builder.channels.teams import verification
from agno_agent_builder.channels.teams.loader import (
    _make_teams_extractor,
    _parse,
    _parse_bind_command,
    _strip_text_mentions,
)
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


@pytest.fixture(autouse=True)
def _reset_jwks_cache() -> Any:
    verification._jwks_cache.keys_by_kid = {}
    verification._jwks_cache.fetched_at = 0.0
    yield
    verification._jwks_cache.keys_by_kid = {}
    verification._jwks_cache.fetched_at = 0.0


def _generate_signing_key() -> tuple[bytes, str, dict[str, Any]]:
    """Create an RSA key and a JWK so we can drive verify_teams_jwt_sync end-to-end."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    public_jwk["kid"] = "test-kid"
    public_jwk["alg"] = "RS256"
    return private_pem, "test-kid", public_jwk


def _issue_token(
    *,
    private_pem: bytes,
    kid: str,
    audience: str,
    service_url: str | None,
    exp_offset: int = 60,
) -> str:
    payload = {
        "aud": audience,
        "iss": "https://api.botframework.com",
        "iat": int(time.time()) - 5,
        "exp": int(time.time()) + exp_offset,
    }
    if service_url:
        payload["serviceurl"] = service_url
    return jwt.encode(payload, private_pem, algorithm="RS256", headers={"kid": kid})


def _prime_cache_with(jwk_dict: dict[str, Any]) -> None:
    verification._jwks_cache.keys_by_kid = {
        jwk_dict["kid"]: jwt.algorithms.RSAAlgorithm.from_jwk(jwk_dict)
    }
    verification._jwks_cache.fetched_at = time.time()


def test_parse_rejects_missing_app_id() -> None:
    with pytest.raises(ValueError, match="appId"):
        _parse({"id": 1, "appPassword": "secret", "agent": {"slug": "a"}})


def test_parse_rejects_missing_app_password() -> None:
    with pytest.raises(ValueError, match="appPassword"):
        _parse({"id": 1, "appId": "abc", "agent": {"slug": "a"}})


def test_parse_rejects_missing_agent_slug() -> None:
    with pytest.raises(ValueError, match=r"agent\.slug"):
        _parse({"id": 1, "appId": "abc", "appPassword": "secret"})


def test_parse_extracts_optional_tenant_id_when_string() -> None:
    install = _parse(
        {
            "id": 7,
            "appId": "appid",
            "appPassword": "secret",
            "agent": {"slug": "agent-x"},
            "tenant": {"slug": "acme"},
            "tenantId": "00000000-0000-0000-0000-000000000000",
        }
    )
    assert install.extras["app_id"] == "appid"
    assert install.extras["app_password"] == "secret"
    assert install.extras["tenant_id"] == "00000000-0000-0000-0000-000000000000"
    assert install.tenant_slug == "acme"


def test_parse_drops_non_string_tenant_id() -> None:
    install = _parse(
        {
            "id": 8,
            "appId": "appid",
            "appPassword": "secret",
            "agent": {"slug": "agent-x"},
            "tenantId": 12345,
        }
    )
    assert install.extras["tenant_id"] is None


def test_parse_bind_command_happy_path() -> None:
    assert _parse_bind_command("bind abc-123") == "abc-123"
    assert _parse_bind_command("BIND abc-123") == "abc-123"
    assert _parse_bind_command("  bind abc-123  ") == "abc-123"


def test_parse_bind_command_rejects_unrelated_text() -> None:
    assert _parse_bind_command("hello there") is None
    assert _parse_bind_command("bind") is None
    assert _parse_bind_command("") is None


def test_strip_text_mentions_removes_bot_mention() -> None:
    text = "<at>BotName</at> bind tok"
    activity = {
        "entities": [
            {"type": "mention", "text": "<at>BotName</at>"},
        ]
    }
    assert _strip_text_mentions(text, activity) == "bind tok"


def test_strip_text_mentions_handles_missing_entities() -> None:
    assert _strip_text_mentions("bind tok", {}) == "bind tok"
    assert _strip_text_mentions("bind tok", {"entities": "nope"}) == "bind tok"


def test_extractor_rejects_non_message_activity() -> None:
    extract = _make_teams_extractor(app_id="bot-app-id")
    headers = {"authorization": "Bearer whatever"}
    out = extract(b"{}", headers, {"type": "conversationUpdate"})
    assert out is None


def test_extractor_rejects_unsigned_or_bad_token() -> None:
    extract = _make_teams_extractor(app_id="bot-app-id")
    update = {
        "type": "message",
        "text": "bind tok-1",
        "serviceUrl": "https://smba.example/teams",
        "from": {"aadObjectId": "user-1"},
        "conversation": {"id": "c-1"},
    }
    assert extract(b"{}", {}, update) is None
    assert extract(b"{}", {"authorization": "Bearer not-a-jwt"}, update) is None


def test_extractor_full_roundtrip_with_valid_jwt() -> None:
    private_pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(
        private_pem=private_pem,
        kid=kid,
        audience="bot-app-id",
        service_url="https://smba.example/teams",
    )
    extract = _make_teams_extractor(app_id="bot-app-id")
    update = {
        "type": "message",
        "text": "bind tok-42",
        "serviceUrl": "https://smba.example/teams",
        "from": {"aadObjectId": "user-1", "name": "Alice"},
        "conversation": {"id": "c-1"},
    }
    headers = {"authorization": f"Bearer {token}"}

    out = extract(json.dumps(update).encode(), headers, update)

    assert out is not None
    assert out.token == "tok-42"
    assert out.external_id == "user-1"
    assert out.external_username == "Alice"
    assert out.reply_target == "https://smba.example/teams|c-1"


def test_extractor_rejects_audience_mismatch() -> None:
    private_pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(
        private_pem=private_pem,
        kid=kid,
        audience="OTHER-bot",
        service_url="https://smba.example/teams",
    )
    extract = _make_teams_extractor(app_id="bot-app-id")
    update = {
        "type": "message",
        "text": "bind tok-42",
        "serviceUrl": "https://smba.example/teams",
        "from": {"aadObjectId": "user-1"},
        "conversation": {"id": "c-1"},
    }
    out = extract(b"{}", {"authorization": f"Bearer {token}"}, update)
    assert out is None


def test_extractor_rejects_service_url_mismatch() -> None:
    private_pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(
        private_pem=private_pem,
        kid=kid,
        audience="bot-app-id",
        service_url="https://smba.example/teams",
    )
    extract = _make_teams_extractor(app_id="bot-app-id")
    update = {
        "type": "message",
        "text": "bind tok-42",
        "serviceUrl": "https://attacker.example/teams",
        "from": {"aadObjectId": "user-1"},
        "conversation": {"id": "c-1"},
    }
    out = extract(b"{}", {"authorization": f"Bearer {token}"}, update)
    assert out is None


def test_extractor_rejects_expired_jwt() -> None:
    private_pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(
        private_pem=private_pem,
        kid=kid,
        audience="bot-app-id",
        service_url="https://smba.example/teams",
        exp_offset=-3600,
    )
    extract = _make_teams_extractor(app_id="bot-app-id")
    update = {
        "type": "message",
        "text": "bind tok-42",
        "serviceUrl": "https://smba.example/teams",
        "from": {"aadObjectId": "user-1"},
        "conversation": {"id": "c-1"},
    }
    out = extract(b"{}", {"authorization": f"Bearer {token}"}, update)
    assert out is None


def test_extractor_rejects_missing_aad_object_id() -> None:
    private_pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(
        private_pem=private_pem,
        kid=kid,
        audience="bot-app-id",
        service_url="https://smba.example/teams",
    )
    extract = _make_teams_extractor(app_id="bot-app-id")
    update = {
        "type": "message",
        "text": "bind tok-42",
        "serviceUrl": "https://smba.example/teams",
        "from": {"name": "no aad"},
        "conversation": {"id": "c-1"},
    }
    out = extract(b"{}", {"authorization": f"Bearer {token}"}, update)
    assert out is None
