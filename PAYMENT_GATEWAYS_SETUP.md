# CaloTrack Payment Gateway Setup

## Production stack locked for phase 1

- Customer account: phone-first
- Live channels: Telegram first, Zalo later
- Active public providers:
  - `MoMo`
  - `Techcombank bank transfer`
- Historical-only providers:
  - `VNPAY`
  - `PayOS`
  - `Stripe`

## Official and starter references

- MoMo official docs:
  - [Notification / IPN handling](https://developers.momo.vn/v3/docs/payment/api/result-handling/notification/)
- MoMo sample repo:
  - [momo-wallet/payment](https://github.com/momo-wallet/payment)
- VietQR image/QR generation:
  - [vietnam-qr-pay](https://github.com/xuannghia/vietnam-qr-pay)
- Bank transfer auto-confirm via Casso:
  - [Casso webhook docs](https://developer.casso.vn/tai-nguyen-khac/tich-hop-xac-nhan-thanh-toan)

## Website env

Set these on Vercel:

- `VITE_SITE_URL=https://calotrack-website.vercel.app`
- `VITE_TELEGRAM_BOT_URL=https://t.me/CaloTrack_bot`
- `VITE_BANK_NAME=Techcombank`
- `VITE_BANK_CODE=TCB`
- `VITE_BANK_ACCOUNT_NUMBER=19034065720011`
- `VITE_BANK_ACCOUNT_NAME=<your_account_name>`
- `VITE_MOMO_CREATE_ORDER_WEBHOOK_URL=<n8n_or_backend_create_order_endpoint>`

## Buyer flow

1. User login by phone OTP.
2. Website creates canonical order with `portal_start_checkout`.
3. If provider is `momo`:
   - website calls `VITE_MOMO_CREATE_ORDER_WEBHOOK_URL`
   - webhook creates MoMo payment session
   - frontend redirects to `payUrl`
   - MoMo IPN marks order paid and activates entitlement
4. If provider is `bank_transfer`:
   - website shows VietQR, Techcombank account, amount, and transfer note
   - user transfers with exact order code
   - Casso webhook or admin reconciliation marks order paid and activates entitlement
5. User lands on `/activate` and links Telegram.

## n8n workflow split

Use separate workflows:

- `CaloTrack - MoMo Create Order`
  - public webhook called by website
  - validates `orderCode`, `amount`, `phone`
  - signs MoMo create-order payload
  - returns `payUrl`
- `CaloTrack - MoMo IPN`
  - receives MoMo callback
  - writes `payment_webhooks`
  - writes `payment_attempts`
  - updates `orders`
  - grants entitlement idempotently
- `CaloTrack - Bank Transfer Webhook (Casso)`
  - receives transfer notification
  - extracts `CT...` order code from transfer content
  - writes payment ledger
  - marks order paid
  - grants entitlement idempotently

## Admin checks

- Admin owner identity is configured privately in production and must not be committed to the repo.
- Bootstrap owner row already exists in production DB.
- `/admin-login` is the correct backoffice lane.
- Test these sections after deploy:
  - `overview`
  - `users`
  - `subscriptions`
  - `usage`
  - `support`
  - `security`

## Non-code production tasks still required

- Configure hosted Supabase auth template for admin magic link.
- Configure phone OTP provider in Supabase if not already live.
- Create MoMo merchant credentials and store them in n8n variables.
- Link Techcombank account to Casso for bank-transfer auto-confirmation.
