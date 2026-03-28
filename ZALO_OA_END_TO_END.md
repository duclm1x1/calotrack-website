# CaloTrack Zalo OA End-to-End

## Current Production State

These parts are already configured and verified on the live systems:

- Zalo app id: `1450975846052622442`
- OA: `Calo Track`
- Canonical inbound workflow: `CaloTrack V18 - Main Workflow - Zalo (Patched)`
- Canonical chat workflow: `CaloTrack V18 - Chat handle - Zalo (Patched)`
- Zalo callback URL saved in Zalo Developer:

```text
https://calotrack-website.vercel.app/zalo-auth-callback
```

- Minimal V1 OA permission set is saved

## Verified URL Prefixes

These URL prefixes are already verified on Zalo Developer:

- `https://calotrack-website.vercel.app/`
- `https://n214.fastn8n.id.vn/webhook/`

Live verifier URLs:

- `https://calotrack-website.vercel.app/zalo_verifierRTQSTUoa7ofjghXohO1eLNsto5YHmHyEEJan.html`
- `https://n214.fastn8n.id.vn/webhook/zalo_verifierRTQSTUoa7ofjghXohO1eLNsto5YHmHyEEJan.html`

## Website Callback Lane

The website now exposes a public callback route for manual OA token exchange:

```text
https://calotrack-website.vercel.app/zalo-auth-callback
```

This route:

- does not require login
- shows `code`, `error`, `error_description`
- lets the operator copy the full redirect URL
- does not exchange tokens on the client

## n8n Workflows

Canonical workflows:

- `CaloTrack V18 - Main Workflow - Zalo (Patched)`
- `CaloTrack V18 - Chat handle - Zalo (Patched)`

Support workflows:

- `CaloTrack - Zalo OA Root Verifier`
- `CaloTrack - Zalo OA Auth Callback`
- `CaloTrack - Zalo OA Refresh Token`

`CaloTrack - Zalo OA Verifier` remains fallback/debug only.  
`CaloTrack - Zalo OA Meta Verify` should remain inactive to avoid confusion with
the canonical webhook path.

## Token Flow

Manual exchange remains the canonical token flow because fastn8n production `GET`
routes are not the primary auth lane.

1. Open the OA permission URL generated from the saved callback URL.
2. OA admin approves.
3. Zalo redirects to:

```text
https://calotrack-website.vercel.app/zalo-auth-callback?...code=...
```

4. Copy the full redirect URL.
5. Exchange locally:

```text
python E:\Antigravity\CaloTrack\Calo Track Website\tools\exchange_zalo_oa_token.py --secret <rotated_secret> --redirect-url "<full_redirect_url_with_code>"
```

Refresh example:

```text
python E:\Antigravity\CaloTrack\Calo Track Website\tools\exchange_zalo_oa_token.py --secret <rotated_secret> --refresh-token <current_refresh_token>
```

Token exchange is already verified end to end. A real authorization code was
issued from the OA permission flow and exchanged successfully into:

- `access_token`
- `refresh_token`
- `expires_in`

## Linked ZBS and Package Status

The OA is linked to a Zalo Business Solutions account.

Observed live state:

- ZBS name: `humanai2910`
- ZBS id: `ZBS-285178`
- linked at: `28/03/2026`

The OA package is now upgraded beyond the previous basic-tier blocker. The
workflow no longer returns:

```text
error: -224
```

This means the official OA message API lane is now available.

## Current Live Verification

### Webhook registration

The webhook URL is now saved successfully in Zalo Developer:

```text
https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2
```

Zalo shows an IP-country warning during validation, but the app allows the
webhook URL to be saved after confirmation.

### Minimal V1 webhook events

These production events are enabled in Zalo Developer:

- `user_send_text`
- `user_send_image`
- `follow`

### Inbound signature verification

The production workflow had two real issues which are now fixed:

1. Zalo sends `X-ZEvent-Signature` as `mac=<hash>`, while the workflow used to
   compare against the raw hash only.
2. The workflow was still verifying with an outdated OA secret after the secret
   rotated in Zalo Developer.

After those fixes, Zalo Developer's own `Test` action now reaches:

- `Zalo OA Webhook`
- `Extract Data`
- onboarding gate and routing nodes

with:

- `signature_valid = true`
- `signature_config_ready = true`

### Current limitation of the built-in Zalo test payload

The Zalo Developer `Test` button uses a synthetic `sender.id`, so outbound reply
currently ends with:

```text
error: -201
message: user_id is invalid
```

That does **not** mean the send API is still blocked. It means the test payload
is not a replyable real user context.

## Final Live Messaging Checks

Run these from a real Zalo account in the OA chat window:

1. `hello`
2. `vừa ăn 1 tô phở bò`
3. `tìm phở bò`
4. `/stats`
5. one meal image

Expected:

- `POST` reaches `CaloTrack V18 - Main Workflow - Zalo (Patched)`
- signature verification passes
- normalized payload uses:
  - `platform = zalo`
  - `platform_id = sender.id`
  - `chat_id = sender.id`
- outbound goes through:

```text
https://openapi.zalo.me/v3.0/oa/message/cs
```

- the user sees the reply in the OA conversation

## Customer Linking

Zalo V1 remains phone-first:

- `customer_channel_accounts.channel = 'zalo'`
- entitlement resolves from `customers`
- guest users use onboarding/free flow
- conflicts do not auto-overwrite
- `support_admin` or `super_admin` handles manual review
