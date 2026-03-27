# CaloTrack Money-Print Readiness

## Target

Phase 1 is considered ready to sell when this path works end to end:

1. Buyer opens the website.
2. Buyer creates a real order from `/checkout`.
3. Buyer transfers the exact amount to Techcombank with the `CT...` order code.
4. Casso webhook confirms the payment in under 1 minute.
5. The order activates the canonical subscription and customer entitlement.
6. Buyer opens Telegram from `/activate`.
7. Telegram links to the same customer and can be used immediately.

Launch lane for this phase:

- `bank_transfer`
- `telegram`

Not required to launch:

- customer portal OTP
- MoMo
- Zalo

## Current Repo State

Implemented in this repo:

- canonical payment migration:
  - `supabase/migrations/20260327103000_bank_transfer_money_print_v1.sql`
- bank transfer webhook worker:
  - `n8n/calotrack_bank_transfer_casso.json`
- public buyer flow:
  - `/checkout`
  - `/activate`
- canonical checkout/order status client:
  - `src/lib/portalApi.ts`
- admin reconciliation UI:
  - manual mark-paid form in `/admin`
- Telegram workflow patches:
  - `E:\Antigravity\CaloTrack\CaloTrack V18 - Main Workflow - 3.json`
  - `E:\Antigravity\CaloTrack\CaloTrack V18 - Chat handle 3.json`

Repo-side status:

- website build passes
- Telegram `main` and `chat handle` workflow JSON now parse correctly
- bank transfer worker now calls `mark_order_paid_and_grant_entitlement(...)`
- Telegram flow now recognizes `linked`, `order_pending`, `needs_support`, `invalid token`

Still requires live rollout:

- apply the new migration on production Supabase
- import/update the Casso workflow in production n8n
- import/update the Telegram `main` and `chat handle` workflows in production n8n
- configure Casso webhook secret
- run the go-live batch test below

## Source Of Truth

Canonical tables/functions for this phase:

- `orders`
- `payment_attempts`
- `payment_webhooks`
- `subscriptions`
- `channel_link_tokens`
- `portal_start_checkout(...)`
- `portal_get_order_status(...)`
- `mark_order_paid_and_grant_entitlement(...)`
- `consume_telegram_link_token(...)`
- `telegram_resolve_user(...)`

Rules:

- `phone = customer canonical`
- `Telegram = linked channel`
- entitlement is granted to the customer, not to the Telegram account
- duplicate webhook must never grant entitlement twice
- wrong amount or wrong transfer note must go to review, not auto-activate

## Rollout Order

### 1. Supabase

Apply:

- `supabase/migrations/20260327103000_bank_transfer_money_print_v1.sql`

Confirm after apply:

- `portal_start_checkout` exists
- `portal_get_order_status` exists
- `mark_order_paid_and_grant_entitlement` exists
- `consume_telegram_link_token` exists
- `admin_mark_order_paid` exists

### 2. n8n bank transfer webhook

Import/update:

- `n8n/calotrack_bank_transfer_casso.json`

Configure:

- Casso secure token
- Supabase credential / service role access
- production webhook URL in Casso dashboard

Expected behavior:

- extract `CT...` from bank transfer content
- verify amount
- call `mark_order_paid_and_grant_entitlement(...)`
- return `needs_review` when content or amount does not match

### 3. Telegram workflows

Import/update both production workflows:

- `E:\Antigravity\CaloTrack\CaloTrack V18 - Main Workflow - 3.json`
- `E:\Antigravity\CaloTrack\CaloTrack V18 - Chat handle 3.json`

Expected behavior:

- `/start <token>` resolves through `telegram_resolve_user(...)`
- pending order returns a clear pending payment reply
- paid order links Telegram to the correct customer
- already-linked or conflict cases return support-safe replies

### 4. Website deploy

Deploy the website only after Supabase and n8n are updated.

Critical buyer pages:

- `/checkout`
- `/activate`
- `/admin-login`
- `/admin`

### 5. Admin verification

Admin must be able to:

- search by phone or order code
- view webhook/payment attempts
- see `pending_confirmation`, `paid`, `active`, `needs_review`
- mark paid manually
- confirm Telegram link state

## Acceptance Criteria

P0 launch is accepted only if all of these pass:

- buyer can create a real order without logging into the portal
- order is stored in canonical tables
- correct transfer auto-activates in under 60 seconds
- Telegram opens with an order-bound token
- Telegram grants access immediately after payment confirmation
- duplicate webhook does not duplicate entitlement
- wrong amount or wrong note never auto-grants
- admin can fix a bad case in under 5 minutes

## Batch Test

Run before opening public traffic:

- 10 valid bank transfers
- 5 wrong transfer notes
- 5 wrong amounts
- 5 duplicate webhook deliveries
- 5 Telegram relink conflicts

Pass bar:

- `10/10` valid transfers auto-activate
- `0` duplicate entitlements
- `100%` invalid transfers go to review
- admin handles manual review in under 5 minutes
- no dead-end buyer screen

## Buyer Journey To Test

1. Open `/checkout?plan=pro`
2. Enter phone
3. Create order
4. Open `/activate`
5. Transfer the exact amount using the shown `CT...` note
6. Wait for status to change
7. Click `Dùng ngay trên Telegram`
8. Open bot
9. Confirm Telegram is linked
10. Log the first meal successfully

## Phase 2

Only after bank transfer is stable:

- enable MoMo create-order + IPN
- keep using the same `orders` and `subscriptions` backend
- keep Telegram link-token flow unchanged
