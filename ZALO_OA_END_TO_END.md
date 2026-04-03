# CaloTrack Zalo OA End-to-End

## Current Production State

These parts are already configured and verified on the live systems:

- Zalo app id: `1450975846052622442`
- OA: `Calo Track`
- Canonical inbound workflow: `CaloTrack V18 - Main Workflow - Zalo (Patched)`
- Canonical chat workflow: `CaloTrack V18 - Chat handle - Zalo (Patched)`
- Live website broker base: `https://calotrack-website.vercel.app`

## Verified URL Prefixes

These URL prefixes are already verified on Zalo Developer:

- `https://calotrack-website.vercel.app/`
- `https://n214.fastn8n.id.vn/webhook/`

Live verifier URLs:

- `https://calotrack-website.vercel.app/zalo_verifierRTQSTUoa7ofjghXohO1eLNsto5YHmHyEEJan.html`
- `https://n214.fastn8n.id.vn/webhook/zalo_verifierRTQSTUoa7ofjghXohO1eLNsto5YHmHyEEJan.html`

## OAuth Callback Lane

The preferred human recovery path is now the server-side OAuth callback flow.

Production start URL:

- `https://calotrack-website.vercel.app/api/zalo-oa-oauth/start`

Production callback URL to register in Zalo Developers:

- `https://calotrack-website.vercel.app/api/zalo-oa-oauth/callback`

Legacy client page kept for debug only:

- `https://calotrack-website.vercel.app/zalo-auth-callback`

Rules:

- the production callback URL in Zalo Developers should point to `/api/zalo-oa-oauth/callback`
- `/zalo-auth-callback` should not be used as the production callback anymore
- the server callback validates `state`, exchanges `code`, bootstraps the broker, and marks the OAuth session consumed

## n8n Workflows

Canonical workflows:

- `CaloTrack V18 - Main Workflow - Zalo (Patched)`
- `CaloTrack V18 - Chat handle - Zalo (Patched)`

Support workflows:

- `CaloTrack - Zalo OA Root Verifier`
- `CaloTrack - Zalo OA Auth Callback`
- `CaloTrack - Zalo OA Refresh Token`
- `CaloTrack - Zalo Browserbase QR Bootstrap`
- `CaloTrack - Zalo Token Keeper`

`CaloTrack - Zalo OA Verifier` remains fallback or debug only.  
`CaloTrack - Zalo OA Meta Verify` should remain inactive to avoid confusion with
the canonical webhook path.

## Canonical Token Flow

Manual token copy is not the runtime model anymore.

Canonical runtime behavior:

- Supabase token store: `private.zalo_oa_token_state`
- OAuth bootstrap session store: `private.zalo_oa_oauth_sessions`
- live broker routes:
  - `/api/zalo-oa-health`
  - `/api/zalo-oa-bootstrap`
  - `/api/zalo-oa-force-refresh`
  - `/api/zalo-oa-browserbase-state`
  - `/api/zalo-oa-send-cs`
  - `/api/zalo-oa-send-template`
  - `/api/zalo-oa-oauth/start`
  - `/api/zalo-oa-oauth/callback`

Runtime rules:

- `access_token` is short-lived cache only
- `refresh_token` is the long-lived credential
- every refresh must overwrite both access token and refresh token
- broker refreshes proactively when expiry is near
- broker refreshes once and retries once when Zalo returns token expiry errors
- when refresh rotation cannot recover, state becomes `reauthorization_required`

Primary recovery:

1. Open `/api/zalo-oa-oauth/start`.
2. OA admin approves in Zalo.
3. Zalo redirects to `/api/zalo-oa-oauth/callback?...code=...`.
4. Server exchanges the code and bootstraps the broker automatically.

Emergency recovery:

- Browserbase context opens API Explorer
- operator scans QR inside Browserbase Live View
- token keeper scrapes a fresh token pair and calls `/api/zalo-oa-bootstrap`

## Browserbase Fallback

Browserbase is now emergency-only, not the normal refresh path.

Rules:

- do not store the QR image
- store the Browserbase context instead
- the QR must be scanned inside Browserbase Live View
- token keeper can often reuse the same Browserbase context to scrape fresh tokens automatically

Supporting files in the repo:

- `docs/zalo-token-automation.md`
- `n8n/calotrack_zalo_browserbase_qr_bootstrap.json`
- `n8n/calotrack_zalo_token_keeper.json`

## Linked ZBS and Package Status

The OA is linked to a Zalo Business Solutions account.

Observed live state:

- ZBS name: `humanai2910`
- ZBS id: `ZBS-285178`
- linked at: `28/03/2026`

The OA package is upgraded beyond the previous basic-tier blocker. The workflow no longer returns:

```text
error: -224
```

This means the official OA message API lane is available.

## ZBS Template Registry

The first ZBS rollout for CaloTrack is locked to:

- OTP
- order confirmation
- payment request
- payment success or entitlement activated
- payment support or payment failed

Current production OTP template:

- template id: `560965`
- type: `Mau OTP`
- payload:

```json
{
  "otp": "123456"
}
```

Use the registry in:

- `docs/zbs-template-registry.md`

for the approved CTA targets, param names, and event mapping for all templates.

## Current Live Verification

### Webhook registration

The webhook URL is saved successfully in Zalo Developer:

```text
https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2
```

### Minimal V1 webhook events

These production events are enabled in Zalo Developer:

- `user_send_text`
- `user_send_image`
- `follow`

### Inbound signature verification

The production workflow had two real issues which are now fixed:

1. Zalo sends `X-ZEvent-Signature` as `mac=<hash>`, while the workflow used to compare against the raw hash only.
2. The workflow was still verifying with an outdated OA secret after the secret rotated in Zalo Developer.

After those fixes, Zalo Developer's own `Test` action now reaches the onboarding and routing nodes with:

- `signature_valid = true`
- `signature_config_ready = true`

### Current limitation of the built-in Zalo test payload

The Zalo Developer `Test` button uses a synthetic `sender.id`, so outbound reply currently ends with:

```text
error: -201
message: user_id is invalid
```

That does not mean the send API is blocked. It means the test payload is not a replyable real user context.

## Final Live Messaging Checks

Run these from a real Zalo account in the OA chat window:

1. `hello`
2. `vua an 1 to pho bo`
3. `tim pho bo`
4. `/stats`
5. one meal image

Expected:

- POST reaches `CaloTrack V18 - Main Workflow - Zalo (Patched)`
- signature verification passes
- normalized payload uses:
  - `platform = zalo`
  - `platform_id = sender.id`
  - `chat_id = sender.id`
- outbound goes through the brokered OA send path rather than direct static token headers
- the user sees the reply in the OA conversation

Live workflow patch target ids:

- `Imz2czCY78iJ2Fau`
- `wCdqvpsE6ZVv0an5`

Every outbound chat send node in those workflows should call:

- `https://calotrack-website.vercel.app/api/zalo-oa-send-cs`

and must no longer send `access_token` directly to `openapi.zalo.me`.

## Customer Linking

Zalo V1 remains phone-first for identity structure, even though runtime access
is now email-first in the current dev phase:

- `customer_channel_accounts.channel = 'zalo'`
- entitlement resolves from `customers`
- guest users use onboarding or free flow
- conflicts do not auto-overwrite
- `support_admin` or `super_admin` handles manual review

## Token Rotation Notes

There is no permanent Zalo OA access token.

Official lifetimes from Zalo:

- authorization code: 10 minutes, one-time use
- access token: 25 hours
- refresh token: 3 months
- refresh token is one-time use and is replaced on every successful refresh

Required secrets for steady-state runtime:

- `ZALO_OA_APP_ID`
- `ZALO_OA_SECRET_KEY`
- `ZALO_OA_INTERNAL_KEY`

Legacy bootstrap-only envs are still accepted during migration:

- `ZALO_OA_ACCESS_TOKEN`
- `ZALO_OA_REFRESH_TOKEN`
- `ZALO_OA_TOKEN_EXPIRES_AT`
- `ZALO_PHONE_TEMPLATE_ACCESS_TOKEN`

These legacy values must not remain the production source of truth after the
shared token store has been bootstrapped.
