# Supabase Auth Production Setup

## Goal

Lock production auth to the intended split:

- Customer portal: phone OTP only
- Admin backoffice: email magic link only

This prevents the old customer magic-link flow and avoids redirects such as `localhost:3000`.

## Production settings

Set these values in the hosted Supabase project:

- Site URL: `https://calotrack-website.vercel.app`
- Redirect URLs:
  - `https://calotrack-website.vercel.app/admin`
  - `https://calotrack-website.vercel.app/admin-login`
  - `https://calotrack-website.vercel.app/dashboard`
  - local dev URLs only if needed for local testing

## Frontend env

Set the canonical origin for the SPA:

- `VITE_SITE_URL=https://calotrack-website.vercel.app`

The admin login page uses this value to generate a stable `emailRedirectTo` target instead of relying on whatever origin the browser is currently on.

## Email template

Use the branded admin magic-link template in:

- `supabase/templates/admin-magic-link.html`

Local Supabase config already points the `magic_link` template at that file in:

- `supabase/config.toml`

For hosted Supabase, mirror the same subject/body in the Auth email template settings if you are not syncing templates automatically.

## Expected production behavior

- `/login` only asks for phone OTP
- `/admin-login` sends the admin-only magic link
- customer-facing screens no longer mention magic links
- admin email copy is clearly marked as backoffice-only
- clicking the admin email lands on the production admin route, not `localhost`
