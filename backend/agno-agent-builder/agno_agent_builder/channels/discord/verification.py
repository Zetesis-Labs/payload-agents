"""Ed25519 signature verification for Discord Interactions endpoints.

Discord signs every webhook with the Application's Ed25519 private key.
The receiver must verify with `X-Signature-Ed25519` against
`X-Signature-Timestamp + body`. Failed verification is a hard 401 — Discord
also pings the endpoint with bad signatures during setup to confirm the
check is wired.
"""

from __future__ import annotations

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def verify_discord_signature(
    *,
    public_key_hex: str,
    timestamp: str,
    body: bytes,
    signature_hex: str,
) -> bool:
    try:
        public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        message = timestamp.encode() + body
        public_key.verify(bytes.fromhex(signature_hex), message)
        return True
    except (InvalidSignature, ValueError):
        return False
