"""JWT verification for Microsoft Bot Framework / Teams inbound activities.

Every Bot Framework request to the messaging endpoint carries an
``Authorization: Bearer <jwt>`` signed by Microsoft. The receiver must:

1. Fetch signing keys from the OpenID configuration document
   (``login.botframework.com/v1/.well-known/openidconfiguration``). Issuer
   is ``https://api.botframework.com``.
2. Validate signature, expiry, issuer, and audience (= bot's AppId).
3. Cross-check the activity body's ``serviceUrl`` claim — when present in
   the JWT (``serviceurl`` claim) it must match the body. Prevents an
   attacker from rewriting the reply target to an attacker-controlled URL.

The signing-key cache is module-global and primed asynchronously by
``prime_jwks_cache`` at channel-mount time. ``verify_teams_jwt_sync`` is
the synchronous reader used by ``IdentityBindMiddleware`` (whose extractor
contract is sync); the async ``verify_teams_jwt`` is used by the route
handler and force-refreshes on cache miss so a recently-rotated kid does
not produce 401 storms.

Failed verification → return ``None``; the caller responds 401. Returned
metadata carries ``tid`` (Entra tenant), ``aud``, ``iss`` for downstream
tenant pinning.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Any

import httpx
import jwt
import structlog

logger = structlog.get_logger("agno_agent_builder.channels.teams.verification")

OPENID_CONFIG_URL = (
    "https://login.botframework.com/v1/.well-known/openidconfiguration"
)
ALLOWED_ISSUERS = (
    "https://api.botframework.com",
)
SIGNING_ALGORITHMS = ("RS256",)
JWKS_TTL_SECONDS = 24 * 60 * 60
CLOCK_SKEW_SECONDS = 5 * 60


@dataclass
class _JWKSCache:
    keys_by_kid: dict[str, Any] = field(default_factory=dict)
    fetched_at: float = 0.0
    lock: Lock = field(default_factory=Lock)


_jwks_cache = _JWKSCache()


def _is_fresh(now: float) -> bool:
    return bool(_jwks_cache.keys_by_kid) and (now - _jwks_cache.fetched_at) < JWKS_TTL_SECONDS


async def prime_jwks_cache(*, force: bool = False) -> dict[str, Any]:
    """Fetch the OpenID config + JWKS and populate the module cache.

    Called at channel-mount time so the synchronous extractor in
    ``IdentityBindMiddleware`` can validate JWTs without network I/O.
    """
    now = time.time()
    if not force and _is_fresh(now):
        return _jwks_cache.keys_by_kid

    async with httpx.AsyncClient(timeout=10.0) as client:
        config = (await client.get(OPENID_CONFIG_URL)).raise_for_status().json()
        jwks_uri = config["jwks_uri"]
        jwks = (await client.get(jwks_uri)).raise_for_status().json()

    keys_by_kid: dict[str, Any] = {}
    for jwk_dict in jwks.get("keys", []):
        kid = jwk_dict.get("kid")
        if not kid:
            continue
        try:
            keys_by_kid[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(jwk_dict)
        except (ValueError, TypeError, KeyError) as exc:
            logger.warning("Skipping malformed Teams JWK", kid=kid, error=str(exc))

    with _jwks_cache.lock:
        _jwks_cache.keys_by_kid = keys_by_kid
        _jwks_cache.fetched_at = now
    return keys_by_kid


@dataclass(slots=True)
class VerifiedClaims:
    """Subset of validated JWT claims a caller cares about for tenant pinning."""

    audience: str
    issuer: str
    service_url: str | None
    tenant_id: str | None
    raw: dict[str, Any]


def _decode_with_keys(
    *,
    token: str,
    keys_by_kid: dict[str, Any],
    expected_app_id: str,
) -> dict[str, Any] | None:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.DecodeError:
        return None
    kid = unverified_header.get("kid")
    if not isinstance(kid, str) or not kid:
        return None

    signing_key = keys_by_kid.get(kid)
    if signing_key is None:
        return None

    try:
        return jwt.decode(
            token,
            key=signing_key,
            algorithms=list(SIGNING_ALGORITHMS),
            audience=expected_app_id,
            issuer=list(ALLOWED_ISSUERS),
            leeway=CLOCK_SKEW_SECONDS,
        )
    except jwt.PyJWTError as exc:
        logger.warning("Teams JWT validation failed", error=str(exc))
        return None


def _build_claims(
    *, claims: dict[str, Any], body_service_url: str | None
) -> VerifiedClaims | None:
    claim_service_url = claims.get("serviceurl")
    if (
        body_service_url
        and isinstance(claim_service_url, str)
        and claim_service_url.rstrip("/") != body_service_url.rstrip("/")
    ):
        logger.warning(
            "Teams JWT serviceurl claim does not match body",
            claim=claim_service_url,
            body=body_service_url,
        )
        return None

    return VerifiedClaims(
        audience=str(claims.get("aud", "")),
        issuer=str(claims.get("iss", "")),
        service_url=claim_service_url if isinstance(claim_service_url, str) else None,
        tenant_id=claims.get("tid") if isinstance(claims.get("tid"), str) else None,
        raw=claims,
    )


def _extract_token(authorization_header: str | None) -> str | None:
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return None
    token = authorization_header.removeprefix("Bearer ").strip()
    return token or None


def verify_teams_jwt_sync(
    *,
    authorization_header: str | None,
    expected_app_id: str,
    body_service_url: str | None,
) -> VerifiedClaims | None:
    """Synchronous validator backed by the primed in-memory cache.

    Used by ``IdentityBindMiddleware`` whose extractor contract is sync.
    Failure modes (unknown kid, bad signature, missing cache) collapse to
    ``None`` — the route handler validates again with refresh and returns
    a proper 401 if the request really is invalid.
    """
    token = _extract_token(authorization_header)
    if token is None:
        return None
    claims = _decode_with_keys(
        token=token, keys_by_kid=_jwks_cache.keys_by_kid, expected_app_id=expected_app_id
    )
    if claims is None:
        return None
    return _build_claims(claims=claims, body_service_url=body_service_url)


async def verify_teams_jwt(
    *,
    authorization_header: str | None,
    expected_app_id: str,
    body_service_url: str | None,
) -> VerifiedClaims | None:
    """Async validator with on-demand JWKS refresh on cache miss."""
    token = _extract_token(authorization_header)
    if token is None:
        return None

    keys_by_kid = await prime_jwks_cache()
    claims = _decode_with_keys(
        token=token, keys_by_kid=keys_by_kid, expected_app_id=expected_app_id
    )
    if claims is None:
        keys_by_kid = await prime_jwks_cache(force=True)
        claims = _decode_with_keys(
            token=token, keys_by_kid=keys_by_kid, expected_app_id=expected_app_id
        )
        if claims is None:
            return None

    return _build_claims(claims=claims, body_service_url=body_service_url)
