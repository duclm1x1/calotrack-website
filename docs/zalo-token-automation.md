# CaloTrack Zalo Token Automation

## Goal

Run Zalo OA continuously without keeping static access tokens in n8n or env files.

Canonical model:

- primary runtime: broker refreshes by HTTP using the latest `refresh_token`
- primary human recovery: official Zalo OAuth callback flow
- emergency fallback: Browserbase context opens API Explorer, operator scans QR once, automation scrapes a fresh token pair and bootstraps the broker
- outbound production sends use broker routes only:
  - `https://calotrack-website.vercel.app/api/zalo-oa-send-cs`
  - `https://calotrack-website.vercel.app/api/zalo-oa-send-template`

There is no permanent Zalo OA access token. Continuous operation depends on refresh-token rotation.

## Canonical Runtime Surfaces

Broker routes:

- `GET /api/zalo-oa-health`
- `POST /api/zalo-oa-force-refresh`
- `POST /api/zalo-oa-bootstrap`
- `GET|POST /api/zalo-oa-browserbase-state`
- `POST /api/zalo-oa-send-cs`
- `POST /api/zalo-oa-send-template`
- `GET /api/zalo-oa-oauth/start`
- `GET /api/zalo-oa-oauth/callback`

Broker rules:

- `access_token` is short-lived cache only
- every refresh must overwrite both `access_token` and `refresh_token`
- old refresh tokens must never be reused
- send failure with `-155` triggers one refresh and one retry
- `reauthorization_required` means the operator must run OAuth recovery or Browserbase recovery

## Database State

Canonical token state stays in `private.zalo_oa_token_state`.

Browserbase state fields:

- `browserbase_context_id`
- `last_browserbase_session_id`
- `last_reauth_at`
- `last_reauth_status`
- `last_reauth_error`

OAuth recovery sessions live in `private.zalo_oa_oauth_sessions`.

Important fields:

- `state`
- `app_id`
- `code_verifier`
- `redirect_after`
- `expires_at`
- `consumed_at`
- `oa_id`
- `created_at`

## OAuth Recovery Flow

This is the default human recovery path when broker health becomes `reauthorization_required`.

1. Open:
   - `https://calotrack-website.vercel.app/api/zalo-oa-oauth/start`
2. Server creates:
   - PKCE `code_verifier`
   - `code_challenge`
   - short-lived OAuth session row in `private.zalo_oa_oauth_sessions`
3. Operator approves the OA in Zalo.
4. Zalo redirects to:
   - `https://calotrack-website.vercel.app/api/zalo-oa-oauth/callback?...`
5. Server validates `state`, exchanges `code`, bootstraps the broker, and marks the OAuth session consumed.
6. Broker health should return a serviceable state again.

Zalo Developer callback URL must be:

- `https://calotrack-website.vercel.app/api/zalo-oa-oauth/callback`

The old client page:

- `https://calotrack-website.vercel.app/zalo-auth-callback`

is legacy/debug only and should not be configured as the production callback URL.

## Browserbase Fallback

Browserbase is emergency recovery only.

Use it when:

- refresh token is invalid
- OAuth callback route is temporarily unavailable
- the operator wants a one-off recovery through API Explorer

Rules:

- do not store the QR image
- store the Browserbase context instead
- the QR must be scanned inside Browserbase Live View, not local Chrome
- the same context can usually be reused, but Zalo can still invalidate it

## n8n Workflows

Import these files:

- `n8n/calotrack_zalo_browserbase_qr_bootstrap.json`
- `n8n/calotrack_zalo_token_keeper.json`

### `CaloTrack - Zalo Browserbase QR Bootstrap`

Purpose:

- create or reuse a persistent Browserbase context
- create a Browserbase Live View session
- save `browserbase_context_id` and `last_browserbase_session_id` into broker state
- output `debuggerFullscreenUrl` so the operator can scan the Zalo QR code

Because this n8n instance does not support Variables, the local export uses embedded defaults and blank placeholders.

Before using the imported workflow, open `Prepare Bootstrap Context` and set:

- `browserbaseApiKey`
- `browserbaseProjectId`
- `internalKey`

Stable defaults already baked into the export:

- `siteUrl = https://calotrack-website.vercel.app`
- `browserbaseRegion = ap-southeast-1`

Operator flow:

1. Run the workflow manually.
2. Open `debuggerFullscreenUrl`.
3. Scan the QR in Browserbase Live View with the Zalo account that owns the developer app.
4. After login succeeds in Browserbase, run `CaloTrack - Zalo Token Keeper` manually once to finish token scrape and bootstrap.

### `CaloTrack - Zalo Token Keeper`

Purpose:

- check broker health every 30 minutes
- if the token is expiring soon, call broker refresh
- if refresh does not restore health, fall back to Browserbase reauthorization
- bootstrap the broker automatically using a fresh token pair

Because this n8n instance does not support Variables, the local export uses embedded defaults and blank placeholders.

Before using the imported workflow, open `Prepare Ops Context` and set:

- `browserbaseApiKey`
- `browserbaseProjectId`
- `internalKey`

Expected flow:

1. `GET /api/zalo-oa-health`
2. if healthy and TTL is comfortably above the threshold, stop
3. if expiring soon, `POST /api/zalo-oa-force-refresh`
4. if refresh does not restore health and Browserbase context exists:
   - open `https://developers.zalo.me/tools/explorer/1450975846052622442`
   - read full `accessToken` and `refreshToken`
   - `POST /api/zalo-oa-bootstrap`
5. if Browserbase context does not exist:
   - run the QR bootstrap workflow once

## Live Workflow Patch

Live workflows:

- `Imz2czCY78iJ2Fau`
- `wCdqvpsE6ZVv0an5`

Every outbound OA chat send node must call:

- `https://calotrack-website.vercel.app/api/zalo-oa-send-cs`

Patch rules:

- remove direct `access_token` headers
- add `x-calotrack-internal-key`
- keep `Content-Type: application/json`
- keep the existing Zalo CS payload shape unchanged

Do not use `n8n-nodes-zalo-oa-integration` as the canonical outbound sender while it still stores direct Zalo tokens in its credential. It can stay for inbound or debug-only use.

## Health Checks

Useful broker routes:

- `GET https://calotrack-website.vercel.app/api/zalo-oa-health`
- `GET https://calotrack-website.vercel.app/api/zalo-oa-browserbase-state`
- `POST https://calotrack-website.vercel.app/api/zalo-oa-force-refresh`
- `POST https://calotrack-website.vercel.app/api/zalo-oa-bootstrap`
- `GET https://calotrack-website.vercel.app/api/zalo-oa-oauth/start`

Healthy target state:

- `tokenStatus = healthy`
- `lastRefreshStatus = ok`
- `browserbaseReady = true` for emergency fallback readiness

## Operational Rule

The durable operating model is:

- broker refreshes by HTTP
- official OAuth callback is the preferred recovery path
- Browserbase context handles rare emergency reauthorization
- operator only rescans QR when Zalo invalidates the Browserbase login session
