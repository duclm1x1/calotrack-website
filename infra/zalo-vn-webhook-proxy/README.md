# CaloTrack Zalo VN Webhook Proxy

This bundle is the minimum production ingress required for Zalo OA V1 when the
primary n8n host resolves outside Vietnam.

## Goal

Expose one HTTPS endpoint on a **Vietnam public IPv4**, verify the inbound Zalo
signature, then forward only trusted requests to the canonical internal n8n webhook:

```text
https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2-internal
```

## Requirements

- A Vietnam-hosted VPS or reverse proxy with public IPv4
- Ports `80` and `443` reachable from the public internet
- A DNS name or A record that resolves to that Vietnam public IPv4
- Docker + Docker Compose

## Files

- `server.mjs`: Zalo signature-verifying adapter
- `Caddyfile`: HTTPS reverse proxy
- `docker-compose.yml`: two-container deployment
- `.env.example`: host configuration

## Deploy

1. Copy this folder to the Vietnam VPS.
2. Create `.env` from `.env.example`.
3. Set:

```text
ZALO_VN_HOST=<your-vietnam-webhook-host>
ZALO_APP_ID=1450975846052622442
ZALO_OA_SECRET_KEY=<your-current-zalo-oa-secret-key>
CALOTRACK_ZALO_INTERNAL_SECRET=ct_zalo_internal_a3f8c9d17b5e
ZALO_OA_N8N_INTERNAL_WEBHOOK_URL=https://n214.fastn8n.id.vn/webhook/calotrack-zalo-oa-v2-internal
```

4. Start the proxy:

```bash
docker compose up -d
```

5. Check health:

```text
https://<your-vietnam-webhook-host>/healthz
```

6. Set the Zalo webhook URL to:

```text
https://<your-vietnam-webhook-host>/zalo/oa/webhook
```

## Why this is required

The current local network path is blocked by infrastructure constraints:

- IPv6-only ingress did not pass ACME validation
- the detected public IPv4 path is behind CGNAT and cannot accept inbound `80/443`
- Zalo rejects the current Cloudflare/Vercel endpoints because they geolocate outside Vietnam

This adapter solves the last ingress blocker without depending on n8n Variables.
It verifies `X-ZEvent-Signature` outside n8n, adds an internal trust header,
and forwards the untouched raw payload to the internal webhook.
