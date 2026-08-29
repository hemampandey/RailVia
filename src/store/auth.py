"""Supabase JWT verification.

The UI hides the Approve button from engineers, but that is a courtesy, not a
control — anyone can call the API directly. Authorisation is therefore
enforced in two places that both have to agree:

  1. Here, so the API knows who is calling and can reject an unsigned or
     expired token before doing any work.
  2. In Postgres, by the row-level-security policies in schema.sql, which is
     what actually stops an engineer inserting an approval.

The second is the real control. This layer exists so the API can attribute a
decision to a named user and fail early with a clear message.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import jwt

JWT_SECRET_VAR = "SUPABASE_JWT_SECRET"


class AuthError(Exception):
    """Token missing, malformed, expired, or wrongly signed."""


@dataclass(frozen=True)
class Caller:
    """The authenticated user behind one request."""

    user_id: str
    email: str
    token: str

    @property
    def label(self) -> str:
        return self.email or self.user_id


def verify(token: str | None) -> Caller:
    """Decode and verify a Supabase access token."""
    if not token:
        raise AuthError("sign in to record a decision")

    secret = os.environ.get(JWT_SECRET_VAR)
    if not secret:
        raise AuthError(
            f"{JWT_SECRET_VAR} is not set — the API cannot verify sign-ins. "
            "Copy it from Supabase → Project Settings → API → JWT Secret."
        )
    try:
        claims = jwt.decode(
            token, secret, algorithms=["HS256"], audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("session expired — sign in again") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid session token: {exc}") from exc

    user_id = claims.get("sub")
    if not user_id:
        raise AuthError("token carries no subject")
    return Caller(user_id=user_id, email=claims.get("email", ""), token=token)


def bearer(header: str | None) -> str | None:
    """Pull the token out of an Authorization header."""
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None
