import argparse
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import requests


DEFAULT_APP_ID = "1450975846052622442"
TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Exchange or refresh Zalo OA tokens for CaloTrack."
    )
    parser.add_argument("--app-id", default=DEFAULT_APP_ID, help="Zalo app id.")
    parser.add_argument("--secret", required=True, help="Rotated Zalo OA app secret.")
    parser.add_argument("--code", help="Authorization code from oa/permission redirect.")
    parser.add_argument(
        "--redirect-url",
        help="Full redirect URL containing ?code=... . If provided, code is extracted automatically.",
    )
    parser.add_argument(
        "--refresh-token",
        help="Existing refresh token. When present, grant_type=refresh_token is used.",
    )
    return parser.parse_args()


def extract_code(redirect_url: str) -> str:
    parsed = urlparse(redirect_url)
    query = parse_qs(parsed.query)
    return (query.get("code") or [""])[0]


def exchange(app_id: str, secret: str, *, code: str | None, refresh_token: str | None):
    if refresh_token:
        payload = {
            "app_id": app_id,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    else:
        if not code:
            raise SystemExit("Missing --code or --redirect-url")
        payload = {
            "app_id": app_id,
            "code": code,
            "grant_type": "authorization_code",
        }

    response = requests.post(
        TOKEN_URL,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "secret_key": secret,
        },
        data=payload,
        timeout=30,
    )

    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text}

    expires_in = int(body.get("expires_in") or body.get("expires") or 0)
    expires_at = None
    if expires_in > 0:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        ).isoformat()

    return {
        "http_status": response.status_code,
        "ok": response.ok and bool(body.get("access_token")),
        "app_id": app_id,
        "grant_type": payload["grant_type"],
        "access_token": body.get("access_token", ""),
        "refresh_token": body.get("refresh_token", refresh_token or ""),
        "expires_in": expires_in,
        "expires_at": expires_at,
        "raw_response": body,
    }


def main():
    args = parse_args()
    code = args.code
    if args.redirect_url:
        code = extract_code(args.redirect_url)
    result = exchange(
        args.app_id,
        args.secret,
        code=code,
        refresh_token=args.refresh_token,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
